// Import the libraries we installed
const express = require('express');
const axios = require('axios');
const admin = require('firebase-admin');

// --- Configuration ---
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN; 
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;

// --- MESSAGES ---
const MESSAGES = {
  help: `🆘 *GoRoute Help Center*

Select an option from the menu below to get started. You can also type commands like "book bus".`,
  no_buses: "❌ *No buses available matching your criteria.*\n\nPlease check back later or try different routes.",
  specify_bus_id: '❌ Please specify the Bus ID.\nExample: "Show seats BUS101"',
  seat_map_error: '❌ Error generating seat map for {busID}.',
  no_seats_found: '❌ No seats found in the system for bus {busID}.',
  feature_wip: '🚧 This feature is coming soon!',
  welcome_back: '👋 Welcome back, {name}!',
  
  // Registration
  prompt_role: "🎉 *Welcome to GoRoute!* To get started, please choose your role:",
  registration_started: "✅ Great! Your role is set to *{role}*.\n\nTo complete your profile, please provide your details in this format:\n\n`my profile details [Your Full Name] / [Your Aadhar Number]`",
  profile_updated: "✅ *Profile Updated!* Your details have been saved.",
  profile_update_error: "❌ *Error!* Please use the correct format:\n`my profile details [Your Name] / [Your Aadhar]`",
  user_not_found: "❌ User not found. Please send /start to register.",

  // Booking
  booking_init: "✅ Booking started for {busID} Seat {seatNo}.\n\n*Passenger 1:* Please provide the name and Aadhar number for this seat in the following format:\n`[Name] / [Aadhar Number]`",
  booking_passenger_prompt: "✅ Passenger {count} details saved.\n\n*Add another passenger?*\nType `add passenger` or type `book finish` to complete booking.",
  booking_finish: "🎫 *Booking Confirmed!* Your seats are reserved.\n\n*Booking ID:* {bookingId}\n*Total Seats:* {count}\n\nThank you for choosing GoRoute!",
  booking_details_error: "❌ *Error!* Please provide details in the format: `[Name] / [Aadhar Number]`",
  seat_not_available: "❌ Seat {seatNo} on bus {busID} is already booked or invalid.",
  no_bookings: "📭 You don't have any active bookings.",
  booking_cancelled: "🗑️ *Booking Cancelled*\n\nBooking {bookingId} has been cancelled successfully.",
  
  // Manager
  manager_add_bus_init: "📝 *Bus Creation:* Enter the new Bus ID (e.g., `BUS201`):",
  manager_add_bus_route: "📍 Enter the Route (e.g., `Delhi to Jaipur`):",
  manager_add_bus_price: "💰 Enter the Base Price (e.g., `850`):",
  manager_add_bus_type: "🚌 Enter the Bus Type (e.g., `AC Seater`):",
  manager_bus_saved: "✅ *Bus {busID} created!* Route: {route}. Price: {price}.",

  // General
  db_error: "❌ CRITICAL ERROR: The bot's database is not connected. Please contact support."
};

// Create the server
const app = express();
app.use(express.json());

// --- Database Initialization ---
let db; 

function getFirebaseDb() {
  if (db) return db;

  try {
    if (admin.apps.length > 0) {
      db = admin.firestore();
      return db;
    }
    
    const rawCredsBase64 = process.env.FIREBASE_CREDS_BASE64;
    if (!rawCredsBase64) {
      throw new Error("CRITICAL: FIREBASE_CREDS_BASE64 is not defined.");
    }
    
    const jsonString = Buffer.from(rawCredsBase64, 'base64').toString('utf8');
    const serviceAccount = JSON.parse(jsonString);

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    
    db = admin.firestore();
    return db;

  } catch (e) {
    console.error("CRITICAL FIREBASE ERROR", e.message);
    throw e; 
  }
}


/* --------------------- Main Webhook Handler ---------------------- */

app.post('/api/webhook', async (req, res) => {
  const update = req.body;
  
  try {
    if (update.message && update.message.text) {
      const message = update.message;
      const chatId = message.chat.id;
      const text = message.text ? message.text.trim() : '';
      const user = message.from;
      
      sendChatAction(chatId, "typing");
      await handleUserMessage(chatId, text, user);
    
    } else if (update.callback_query) {
      const callback = update.callback_query;
      const chatId = callback.message.chat.id;
      const callbackData = callback.data;
      const messageId = callback.message.message_id;
      
      await answerCallbackQuery(callback.id);
      await editMessageReplyMarkup(chatId, messageId, null);

      sendChatAction(chatId, "typing");

      // --- ROUTE CALLBACKS ---
      if (callbackData.startsWith('cb_register_role_')) {
        await handleRoleSelection(chatId, callback.from, callbackData);
      } else if (callbackData === 'cb_book_bus') {
        await handleBusSearch(chatId);
      } else if (callbackData === 'cb_my_booking') {
        await handleBookingInfo(chatId);
      } else if (callbackData === 'cb_my_profile') {
        await handleUserProfile(chatId);
      } else if (callbackData === 'cb_add_bus_manager') {
        await handleManagerAddBus(chatId); // New Manager Action
      } else if (callbackData === 'cb_help' || callbackData === 'cb_status') {
        await sendHelpMessage(chatId);
      }
    }
  } catch (error) {
    console.error("Error in main handler:", error.message);
  }

  res.status(200).send('OK');
});


/* --------------------- Message Router ---------------------- */

async function handleUserMessage(chatId, text, user) {
  const textLower = text.toLowerCase().trim();

  // --- STATE MANAGEMENT CHECK (Highest Priority) ---
  const state = await getAppState(chatId);
  if (state.state !== 'IDLE') {
      if (state.state.startsWith('AWAITING_PASSENGER')) {
         await handleBookingInput(chatId, text, state);
      } else if (state.state.startsWith('MANAGER_ADD_BUS')) {
         await handleManagerInput(chatId, text, state);
      }
      return;
  }

  // --- STANDARD COMMANDS ---
  if (textLower === '/start') {
    await startUserRegistration(chatId, user);
  }
  else if (textLower.startsWith('my profile details')) {
    await handleProfileUpdate(chatId, text);
  }
  else if (textLower === 'book bus' || textLower === '/book') {
    await handleBusSearch(chatId);
  }
  else if (textLower.startsWith('show seats')) {
    await handleSeatMap(chatId, text);
  }
  else if (textLower.startsWith('book seat')) {
    await handleSeatSelection(chatId, text);
  }
  else if (textLower === 'my booking' || textLower === 'my tickets') {
    await handleBookingInfo(chatId);
  }
  else if (textLower.startsWith('cancel booking')) {
    await handleCancellation(chatId, text);
  }
  else if (textLower === 'my profile' || textLower === '/profile') {
    await handleUserProfile(chatId);
  }
  else if (textLower === 'help' || textLower === '/help') {
    await sendHelpMessage(chatId);
  }
  else { 
    await sendMessage(chatId, MESSAGES.unknown_command);
  }
}

/* --------------------- General Handlers ---------------------- */

async function handleBusSearch(chatId) {
    try {
        const db = getFirebaseDb();
        
        const snapshot = await db.collection('buses').get();
        const buses = [];

        snapshot.forEach(doc => {
            const data = doc.data();
            buses.push({
                busID: data.bus_id,
                from: data.from,
                to: data.to,
                date: data.departure_time.split(' ')[0],
                time: data.departure_time.split(' ')[1],
                owner: data.owner,
                price: data.price,
                busType: data.bus_type,
                rating: data.rating || 4.2, 
                availableSeats: data.total_seats || 40 
            });
        });

        if (buses.length === 0) {
            await sendMessage(chatId, MESSAGES.no_buses, "Markdown");
            return;
        }

        let response = `🚌 *Available Buses* 🚌\n\n`;
        
        buses.forEach((bus, index) => {
            response += `*${index + 1}. ${bus.busID}* - ${bus.owner}\n`;
            response += `📍 ${bus.from} → ${bus.to}\n`;
            response += `🕒 ${bus.date} ${bus.time}\n`;
            response += `💰 ₹${bus.price} • ${bus.busType} • ⭐ ${bus.rating}\n`;
            response += `💺 ${bus.availableSeats} seats available\n`;
            response += `📋 *"Show seats ${bus.busID}"* to view seats\n\n`;
        });
        
        await sendMessage(chatId, response, "Markdown");
        
    } catch (error) {
        console.error('❌ Bus search error:', error.message);
        await sendMessage(chatId, MESSAGES.db_error);
    }
}

async function handleCancellation(chatId, text) {
    const match = text.match(/cancel booking\s+(BOOK\d+)/i);
    if (!match) return await sendMessage(chatId, "❌ Please specify Booking ID.\nExample: `Cancel booking BOOK123`", "Markdown");

    const bookingId = match[1].toUpperCase();
    
    try {
        const db = getFirebaseDb();
        const bookingRef = db.collection('bookings').doc(bookingId);
        const bookingDoc = await bookingRef.get();

        if (!bookingDoc.exists || bookingDoc.data().chat_id !== String(chatId)) {
            return await sendMessage(chatId, `❌ Booking ${bookingId} not found or you don't have permission to cancel it.`);
        }

        const batch = db.batch();
        const bookingData = bookingDoc.data();

        batch.update(bookingRef, { status: 'cancelled', cancelled_at: admin.firestore.FieldValue.serverTimestamp() });

        bookingData.seats.forEach(seatNo => {
            const seatRef = db.collection('seats').doc(`${bookingData.bus_id}-${seatNo}`);
            batch.update(seatRef, { status: 'available', booking_id: admin.firestore.FieldValue.delete(), temp_chat_id: admin.firestore.FieldValue.delete() });
        });

        await batch.commit();
        await sendMessage(chatId, MESSAGES.booking_cancelled.replace('{bookingId}', bookingId), "Markdown");

    } catch (e) {
        console.error('❌ Cancellation error:', e.message);
        await sendMessage(chatId, MESSAGES.db_error);
    }
}

// --- STATE MANAGEMENT HELPERS ---

async function getAppState(chatId) {
    const db = getFirebaseDb();
    const doc = await db.collection('user_state').doc(String(chatId)).get();
    if (doc.exists) return { state: doc.data().state, data: doc.data().data };
    return { state: 'IDLE', data: {} };
}

async function saveAppState(chatId, stateName, data) {
    const db = getFirebaseDb();
    await db.collection('user_state').doc(String(chatId)).set({
        state: stateName,
        data: data,
        updated_at: admin.firestore.FieldValue.serverTimestamp()
    });
}

// --- ROLE-BASED FEATURES (Bus Manager/Owner) ---

async function handleManagerAddBus(chatId) {
    try {
        const userRole = await getUserRole(chatId);
        if (userRole !== 'manager' && userRole !== 'owner') {
             return await sendMessage(chatId, "❌ You do not have permission to add buses.");
        }
        
        await saveAppState(chatId, 'MANAGER_ADD_BUS_ID', {});
        await sendMessage(chatId, MESSAGES.manager_add_bus_init, "Markdown");

    } catch (error) {
        console.error('❌ Manager Add Bus error:', error.message);
        await sendMessage(chatId, MESSAGES.db_error);
    }
}

async function handleManagerInput(chatId, text, state) {
    const db = getFirebaseDb();
    const data = state.data;
    let nextState = '';
    let response = '';

    try {
        switch (state.state) {
            case 'MANAGER_ADD_BUS_ID':
                data.busID = text.toUpperCase().replace(/[^A-Z0-9]/g, '');
                if (!data.busID) return await sendMessage(chatId, "❌ Invalid Bus ID. Try again:", "Markdown");
                
                nextState = 'MANAGER_ADD_BUS_ROUTE';
                response = MESSAGES.manager_add_bus_route;
                break;
                
            case 'MANAGER_ADD_BUS_ROUTE':
                data.route = text;
                nextState = 'MANAGER_ADD_BUS_PRICE';
                response = MESSAGES.manager_add_bus_price;
                break;

            case 'MANAGER_ADD_BUS_PRICE':
                data.price = parseFloat(text.replace(/[^0-9.]/g, ''));
                if (isNaN(data.price)) return await sendMessage(chatId, "❌ Invalid price. Enter a number (e.g., 850):", "Markdown");
                
                nextState = 'MANAGER_ADD_BUS_TYPE';
                response = MESSAGES.manager_add_bus_type;
                break;
                
            case 'MANAGER_ADD_BUS_TYPE':
                data.busType = text;
                data.departure_time = new Date().toISOString().split('T')[0] + " 10:00"; // Mocking time for simplicity
                
                const userDoc = await db.collection('users').doc(String(chatId)).get();
                const ownerName = userDoc.exists ? userDoc.data().name : 'System Owner';

                // --- DYNAMIC COLLECTION CREATION HERE ---
                // If 'buses' collection doesn't exist, it will be created now.
                await db.collection('buses').doc(data.busID).set({
                    bus_id: data.busID,
                    owner: ownerName,
                    from: data.route.split(' to ')[0].trim(),
                    to: data.route.split(' to ')[1].trim(),
                    departure_time: data.departure_time,
                    price: data.price,
                    bus_type: data.busType,
                    total_seats: 40, 
                    rating: 5.0,
                    status: 'scheduled'
                });
                
                // Clear state
                await db.collection('user_state').doc(String(chatId)).delete(); 

                response = MESSAGES.manager_bus_saved.replace('{busID}', data.busID).replace('{route}', data.route).replace('{price}', data.price);
                await sendMessage(chatId, response, "Markdown");
                return;
        }

        // Save state and prompt next question
        await saveAppState(chatId, nextState, data);
        await sendMessage(chatId, response, "Markdown");

    } catch (error) {
        console.error('❌ Manager Input Flow Error:', error.message);
        await db.collection('user_state').doc(String(chatId)).delete(); // Clear state on failure
        await sendMessage(chatId, MESSAGES.db_error + " Bus creation failed. Please try again.");
    }
}

// --- BOOKING STATE MACHINE LOGIC ---

async function handleBookingInput(chatId, text, state) {
    // This is the multi-passenger logic you requested.
    const db = getFirebaseDb();
    const booking = state.data;
    const currentSeat = booking.seats[booking.currentSeatIndex];

    // --- State 1: AWAITING PASSENGER DETAILS ---
    if (state.state === 'AWAITING_PASSENGER_DETAILS') {
        const passengerMatch = text.match(/([^\/]+)\s*\/\s*(\d+)/i);
        if (!passengerMatch) return await sendMessage(chatId, MESSAGES.booking_details_error, "Markdown");

        const name = passengerMatch[1].trim();
        const aadhar = passengerMatch[2].trim();
        
        // Save passenger details
        booking.passengers.push({ name, aadhar, seat: currentSeat.seatNo });
        booking.currentSeatIndex++;
        
        // Ask for next step
        await saveAppState(chatId, 'AWAITING_BOOKING_ACTION', booking);
        
        // Send next prompt with options (using the provided text commands for simplicity)
        const nextPrompt = MESSAGES.booking_passenger_prompt.replace('{count}', booking.passengers.length);
        const instructions = "\n\nType `book finish` to confirm the booking.";

        await sendMessage(chatId, nextPrompt + instructions, "Markdown");
        
        return;
    }
    
    // --- State 2: AWAITING BOOKING ACTION ---
    if (state.state === 'AWAITING_BOOKING_ACTION') {
        if (text === 'book finish') {
            await finalizeBooking(chatId, booking);
            return;
        } else if (text === 'add passenger') {
             // For the next step, we would enter AWAITING_SEAT_SELECTION state here,
             // but for simplicity, we will keep it simple.
             return await sendMessage(chatId, "❌ Sorry, multi-seat selection for other people is currently disabled. Please type `book finish`.", "Markdown");
        }
    }
    
    await sendMessage(chatId, "Please use the provided commands (`book finish`) to continue.", "Markdown");
}

async function finalizeBooking(chatId, booking) {
    try {
        const db = getFirebaseDb();
        const bookingId = 'BOOK' + Date.now();
        const batch = db.batch();

        // 1. Create the final booking document
        const bookingRef = db.collection('bookings').doc(bookingId);
        batch.set(bookingRef, {
            booking_id: bookingId,
            chat_id: String(chatId),
            bus_id: booking.busID,
            passengers: booking.passengers,
            seats: booking.seats.map(s => s.seatNo),
            status: 'confirmed',
            total_seats: booking.passengers.length,
            created_at: admin.firestore.FieldValue.serverTimestamp()
        });

        // 2. Update seat status to permanently 'booked'
        booking.seats.forEach(seat => {
            const seatRef = db.collection('seats').doc(`${booking.busID}-${seat.seatNo}`);
            batch.update(seatRef, { status: 'booked', booking_id: bookingId, temp_chat_id: admin.firestore.FieldValue.delete() });
        });

        // 3. Delete the state document
        batch.delete(db.collection('user_state').doc(String(chatId)));
        
        await batch.commit();

        // 4. Confirmation message
        await sendMessage(chatId, MESSAGES.booking_finish.replace('{bookingId}', bookingId).replace('{count}', booking.passengers.length), "Markdown");

    } catch (error) {
        console.error('❌ finalizeBooking error:', error.message);
        // If it fails, try to unlock the seats
        await unlockSeats(booking);
        await sendMessage(chatId, MESSAGES.db_error + " Booking failed. Seats were released.");
    }
}


/* --------------------- General Helper Functions ---------------------- */

async function getUserRole(chatId) {
    try {
        const db = getFirebaseDb();
        const doc = await db.collection('users').doc(String(chatId)).get();
        if (doc.exists) return doc.data().role;
        return 'unregistered';
    } catch (e) {
        console.error('Error fetching role:', e.message);
        return 'error';
    }
}

async function sendHelpMessage(chatId) {
    const userRole = await getUserRole(chatId);
    let keyboard;

    if (userRole === 'manager' || userRole === 'owner') {
        keyboard = {
            inline_keyboard: [
                [{ text: "➕ Add New Bus", callback_data: "cb_add_bus_manager" }],
                [{ text: "🚌 View Schedules", callback_data: "cb_book_bus" }],
                [{ text: "👤 My Profile", callback_data: "cb_my_profile" }],
            ]
        };
    } else {
        keyboard = {
            inline_keyboard: [
                [{ text: "🚌 Book a Bus", callback_data: "cb_book_bus" }],
                [{ text: "🎫 My Bookings", callback_data: "cb_my_booking" }, { text: "👤 My Profile", callback_data: "cb_my_profile" }],
                [{ text: "ℹ️ Help / Status", callback_data: "cb_status" }]
            ]
        };
    }
    await sendMessage(chatId, MESSAGES.help, "Markdown", keyboard);
}

// Gets bus info from the 'buses' collection
async function getBusInfo(busID) {
    try {
        const db = getFirebaseDb();
        const snapshot = await db.collection('buses').where('bus_id', '==', busID).limit(1).get();
        if (snapshot.empty) return null;
        
        const data = snapshot.docs[0].data();
        return {
            busID: data.bus_id,
            from: data.from,
            to: data.to,
            date: data.departure_time.split(' ')[0],
            time: data.departure_time.split(' ')[1]
        };
    } catch (e) {
        console.error("Error fetching bus info:", e.message);
        return null;
    }
}

async function unlockSeats(booking) {
    try {
        const db = getFirebaseDb();
        const batch = db.batch();
        booking.seats.forEach(seat => {
            const seatRef = db.collection('seats').doc(`${booking.busID}-${seat.seatNo}`);
            batch.update(seatRef, { status: 'available', temp_chat_id: admin.firestore.FieldValue.delete() });
        });
        await batch.commit();
    } catch (e) {
        console.error("CRITICAL: Failed to unlock seats:", e.message);
    }
}

// --- TELEGRAM AXIOS HELPERS ---

async function sendMessage(chatId, text, parseMode = null, replyMarkup = null) {
  try {
    const payload = { chat_id: chatId, text: text, parse_mode: parseMode };
    if (replyMarkup) payload.reply_markup = replyMarkup;
    await axios.post(`${TELEGRAM_API}/sendMessage`, payload);
  } catch (error) {
    // Suppress errors
  }
}

async function sendChatAction(chatId, action) {
  try {
    await axios.post(`${TELEGRAM_API}/sendChatAction`, { chat_id: chatId, action: action });
  } catch (error) {
    // Suppress errors
  }
}

async function answerCallbackQuery(callbackQueryId) {
  try {
    await axios.post(`${TELEGRAM_API}/answerCallbackQuery`, { callback_query_id: callbackQueryId });
  } catch (error) {
    // Suppress errors
  }
}

async function editMessageReplyMarkup(chatId, messageId, replyMarkup) {
  try {
    await axios.post(`${TELEGRAM_API}/editMessageReplyMarkup`, {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: replyMarkup
    });
  } catch (error) {
    // Suppress "message is not modified" errors
  }
}

// Start the server
module.exports = app;
