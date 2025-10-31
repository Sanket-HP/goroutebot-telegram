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
  booking_init: "✅ Booking started for {busID} Seat {seatNo}.\n\n*Passenger {count}:* Please provide the name and Aadhar number for this seat in the following format:\n`[Name] / [Aadhar Number]`",
  booking_passenger_prompt: "✅ Passenger {count} details saved for seat {seatNo}.\n\n*What's next?*",
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
  manager_bus_saved: "✅ *Bus {busID} created!* Route: {route}. Price: {price}. You can now add seats.",

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
    
    // --- SAFETY CHECK ---
    const rawCredsBase64 = process.env.FIREBASE_CREDS_BASE64;
    if (!rawCredsBase64) {
      // This is the CRITICAL ERROR handler. It throws, so the caller can send a message.
      throw new Error("CRITICAL: FIREBASE_CREDS_BASE64 is not defined in Vercel Environment Variables.");
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
        await handleManagerAddBus(chatId);
      } else if (callbackData === 'cb_add_passenger') { // NEW: Add Passenger button click
        await handleAddPassengerCallback(chatId);
      } else if (callbackData === 'cb_book_finish') { // NEW: Finish Booking button click
        const state = await getAppState(chatId);
        if (state.state.startsWith('AWAITING_BOOKING_ACTION')) {
            await finalizeBooking(chatId, state.data);
        } else {
            await sendMessage(chatId, "❌ You don't have an active booking to finish.");
        }
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

async function startUserRegistration(chatId, user) {
  try {
    const db = getFirebaseDb();
    const doc = await db.collection('users').doc(String(chatId)).get();

    if (doc.exists) {
      await sendMessage(chatId, MESSAGES.welcome_back.replace('{name}', user.first_name || 'User'));
      await sendHelpMessage(chatId); 
    } else {
      const keyboard = {
        inline_keyboard: [
          [{ text: "👤 User (Book Tickets)", callback_data: "cb_register_role_user" }],
          [{ text: "👨‍💼 Bus Manager (Manage Buses)", callback_data: "cb_register_role_manager" }],
          [{ text: "👑 Bus Owner (Manage Staff)", callback_data: "cb_register_role_owner" }],
        ]
      };
      await sendMessage(chatId, MESSAGES.prompt_role, "Markdown", keyboard);
    }
  } catch (error) {
    console.error('❌ /start error:', error.message);
    await sendMessage(chatId, MESSAGES.db_error);
  }
}

async function handleRoleSelection(chatId, user, callbackData) {
  try {
    const role = callbackData.split('_').pop();
    const db = getFirebaseDb();
    const newUser = {
      user_id: 'USER' + Date.now(),
      name: user.first_name + (user.last_name ? ' ' + user.last_name : ''),
      chat_id: String(chatId),
      phone: '', aadhar: '',
      status: 'pending_details',
      role: role, lang: 'en',
      join_date: admin.firestore.FieldValue.serverTimestamp()
    };
    await db.collection('users').doc(String(chatId)).set(newUser);
    await sendMessage(chatId, MESSAGES.registration_started.replace('{role}', role), "Markdown");
  } catch (error) {
    console.error('❌ handleRoleSelection error:', error.message);
    await sendMessage(chatId, MESSAGES.db_error);
  }
}

async function handleProfileUpdate(chatId, text) {
  try {
    const match = text.match(/my profile details\s+([^\/]+)\s*\/\s*(\d+)/i);
    if (!match) {
      await sendMessage(chatId, MESSAGES.profile_update_error, "Markdown");
      return;
    }
    const name = match[1].trim();
    const aadhar = match[2].trim();

    const db = getFirebaseDb();
    const userRef = db.collection('users').doc(String(chatId));
    const doc = await userRef.get();

    if (!doc.exists) {
      await sendMessage(chatId, MESSAGES.user_not_found);
      return;
    }
    
    await userRef.update({ name: name, aadhar: aadhar, status: 'active' });
    await sendMessage(chatId, MESSAGES.profile_updated, "Markdown");
    await handleUserProfile(chatId);

  } catch (error) {
    console.error('❌ handleProfileUpdate error:', error.message);
    await sendMessage(chatId, MESSAGES.db_error);
  }
}

async function handleUserProfile(chatId) {
  try {
    const db = getFirebaseDb();
    const doc = await db.collection('users').doc(String(chatId)).get();

    if (doc.exists) {
      const user = doc.data();
      const joinDate = user.join_date ? user.join_date.toDate().toLocaleDateString('en-IN') : 'N/A';
      
      const profileText = `👤 *Your Profile*\n\n` +
                          `*Name:* ${user.name || 'Not set'}\n` +
                          `*Chat ID:* ${user.chat_id}\n` +
                          `*Phone:* ${user.phone || 'Not set'}\n` +
                          `*Aadhar:* ${user.aadhar || 'Not set'}\n` +
                          `*Role:* ${user.role || 'user'}\n` +
                          `*Status:* ${user.status || 'N/A'}\n` +
                          `*Member since:* ${joinDate}`;
      
      await sendMessage(chatId, profileText, "Markdown");
    } else {
      await sendMessage(chatId, MESSAGES.user_not_found);
    }

  } catch (error) {
    console.error('❌ Error in handleUserProfile:', error.message);
    await sendMessage(chatId, MESSAGES.db_error);
  }
}

async function handleBookingInfo(chatId) {
    try {
        const db = getFirebaseDb();
        const snapshot = await db.collection('bookings').where('chat_id', '==', String(chatId)).get();
        
        if (snapshot.empty) return await sendMessage(chatId, MESSAGES.no_bookings);

        let response = "🎫 *Your Active Bookings*\n\n";
        snapshot.forEach(doc => {
            const b = doc.data();
            const seatsList = b.seats.join(', ');
            response += `📋 *ID: ${b.booking_id}*\n`;
            response += `🚌 Bus: ${b.bus_id}\n`;
            response += `💺 Seats: ${seatsList}\n`;
            response += `👥 Passengers: ${b.passengers.length}\n`;
            response += `Status: ${b.status}\n\n`;
        });
        response += `💡 To cancel, type "Cancel booking BOOKING_ID"`;
        await sendMessage(chatId, response, "Markdown");
    } catch (e) {
        await sendMessage(chatId, MESSAGES.db_error);
    }
}

async function handleSystemStatus(chatId) {
    try {
        const db = getFirebaseDb();
        const userCount = (await db.collection('users').get()).size;
        const bookingCount = (await db.collection('bookings').get()).size;
        const busCount = (await db.collection('buses').get()).size;

        const statusText = `📊 *System Status*\n\n🟢 *Status:* Operational\n👥 *Users:* ${userCount}\n🎫 *Bookings:* ${bookingCount}\n🚌 *Buses:* ${busCount}\n🕒 *Last Check:* ${new Date().toLocaleTimeString('en-IN')}\n\n💡 All database services are functioning normally.`;
        await sendMessage(chatId, statusText, "Markdown");
    } catch (e) {
        await sendMessage(chatId, MESSAGES.db_error);
    }
}

async function handleLiveTracking(chatId, text) {
  await sendMessage(chatId, MESSAGES.feature_wip, "Markdown");
}

async function handleSetLanguage(chatId, language) {
  await sendMessage(chatId, MESSAGES.feature_wip);
}


/* --------------------- Seat/Booking Logic ---------------------- */

async function handleSeatMap(chatId, text) {
  try {
    const busMatch = text.match(/(BUS\d+)/i);
    const busID = busMatch ? busMatch[1].toUpperCase() : null;
    
    if (!busID) return await sendMessage(chatId, MESSAGES.specify_bus_id, "Markdown");

    const db = getFirebaseDb();
    const busInfo = await getBusInfo(busID);
    if (!busInfo) return await sendMessage(chatId, MESSAGES.seat_map_error.replace('{busID}', busID), "Markdown");

    const seatsSnapshot = await db.collection('seats').where('bus_id', '==', busID).get();
    const seatStatus = {};
    let availableCount = 0;
    
    seatsSnapshot.forEach(doc => {
      const data = doc.data();
      seatStatus[data.seat_no] = data.status;
      if (data.status === 'available' || data.status === 'locked') availableCount++;
    });

    let seatMap = `🚍 *Seat Map - ${busID}*\n`;
    seatMap += `📍 ${busInfo.from} → ${busInfo.to}\n`;
    seatMap += `🕒 ${busInfo.date} ${busInfo.time}\n\n`;
    seatMap += `Legend: 🟩 Available • ⚫ Booked\n\n`;

    for (let row = 1; row <= 10; row++) {
      let line = '';
      for (let col of ['A', 'B', 'C', 'D']) {
        const seatNo = `${row}${col}`;
        const status = seatStatus[seatNo] || '⬜️'; 
        
        let icon = '⬜️'; // Default to unfound/missing
        if (status === 'available') icon = '🟩';
        if (status === 'booked' || status === 'locked') icon = '⚫'; 
        
        line += `${icon}${seatNo}`;
        if (col === 'B') {
          line += `    🚌    `; // Aisle
        } else {
          line += ` `;
        }
      }
      seatMap += line + '\n';
    }
    
    seatMap += `\n📊 *${availableCount}* seats available / ${seatsSnapshot.size || 0}\n\n`;
    seatMap += `💡 *Book a seat:* "Book seat ${busID} 1A"`;

    await sendMessage(chatId, seatMap, "Markdown");
    
  } catch (error) {
    console.error('❌ Seat map error:', error.message);
    await sendMessage(chatId, MESSAGES.db_error);
  }
}

async function handleSeatSelection(chatId, text) {
    try {
        const match = text.match(/book seat\s+(BUS\d+)\s+([A-Z0-9]+)/i);
        if (!match) return await sendMessage(chatId, "❌ Please specify Bus ID and Seat Number.\nExample: `Book seat BUS101 3A`", "Markdown");

        const busID = match[1].toUpperCase();
        const seatNo = match[2].toUpperCase();

        const db = getFirebaseDb();
        
        const seatRef = db.collection('seats').doc(`${busID}-${seatNo}`);
        const seatDoc = await seatRef.get();

        if (!seatDoc.exists || seatDoc.data().status !== 'available') {
             return await sendMessage(chatId, MESSAGES.seat_not_available.replace('{seatNo}', seatNo).replace('{busID}', busID), "Markdown");
        }

        await seatRef.update({ status: 'locked', temp_chat_id: String(chatId) });
        
        const bookingData = {
            busID,
            seats: [{ seatNo, status: 'locked' }],
            passengers: [],
            currentSeatIndex: 0,
        };

        await saveAppState(chatId, 'AWAITING_PASSENGER_DETAILS', bookingData);
        
        await sendMessage(chatId, MESSAGES.booking_init.replace('{count}', 1).replace('{seatNo}', seatNo).replace('{busID}', busID), "Markdown");
        
    } catch (error) {
        console.error('❌ handleSeatSelection error:', error.message);
        await sendMessage(chatId, MESSAGES.db_error);
    }
}

async function handleBookingInput(chatId, textLower, state) {
    const booking = state.data;
    const currentSeat = booking.seats[booking.currentSeatIndex];

    // --- State 1: AWAITING PASSENGER DETAILS (For Current Seat) ---
    if (state.state === 'AWAITING_PASSENGER_DETAILS') {
        const passengerMatch = textLower.match(/([^\/]+)\s*\/\s*(\d+)/i);
        if (!passengerMatch) return await sendMessage(chatId, MESSAGES.booking_details_error, "Markdown");

        const name = passengerMatch[1].trim();
        const aadhar = passengerMatch[2].trim();
        
        // Save passenger details
        booking.passengers.push({ name, aadhar, seat: currentSeat.seatNo });
        
        // Ask for next step
        await saveAppState(chatId, 'AWAITING_BOOKING_ACTION', booking);
        
        const keyboard = {
            inline_keyboard: [
                [{ text: "➕ Add Another Passenger", callback_data: "cb_add_passenger" }],
                [{ text: "✅ Complete Booking", callback_data: "cb_book_finish" }]
            ]
        };
        await sendMessage(chatId, MESSAGES.booking_passenger_prompt.replace('{count}', booking.passengers.length).replace('{seatNo}', currentSeat.seatNo), "Markdown", keyboard);
        
        return;
    }
    
    // --- State 2: AWAITING BOOKING ACTION ---
    // Actions are handled by buttons (callbacks) now. Reject text input.
    await sendMessage(chatId, "Please use the provided buttons to continue (Add Another Passenger or Complete Booking).", "Markdown");
}

async function handleAddPassengerCallback(chatId) {
    try {
        const state = await getAppState(chatId);
        const booking = state.data;
        
        // --- This logic mocks selecting and locking the next seat ---
        if (state.state !== 'AWAITING_BOOKING_ACTION') return await sendMessage(chatId, "❌ Please start a new booking first (Book seat BUS ID).");
        
        const nextSeatIndex = booking.seats.length + 1;
        // MOCK SEAT SELECTION: Assigns a new seat name (e.g., BUS101-1A, BUS101-2A)
        const nextSeatNo = booking.busID + "-" + nextSeatIndex + 'A'; 

        // NOTE: In a REAL system, this must query Firebase for the next available seat
        // and lock it before proceeding. We skip the real DB lock here.

        booking.seats.push({ seatNo: nextSeatNo, status: 'locked' }); 
        booking.currentSeatIndex = booking.seats.length - 1; // Point to the new seat
        
        await saveAppState(chatId, 'AWAITING_PASSENGER_DETAILS', booking);
        
        await sendMessage(chatId, MESSAGES.booking_init.replace('{count}', booking.passengers.length + 1).replace('{seatNo}', nextSeatNo).replace('{busID}', booking.busID), "Markdown");

    } catch (error) {
        console.error('❌ handleAddPassengerCallback error:', error.message);
        await sendMessage(chatId, MESSAGES.db_error);
    }
}

async function finalizeBooking(chatId, booking) {
    try {
        const db = getFirebaseDb();
        const bookingId = 'BOOK' + Date.now();
        const batch = db.batch();

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

        booking.seats.forEach(seat => {
            const seatRef = db.collection('seats').doc(`${booking.busID}-${seat.seatNo}`);
            // This will fail if the seat doesn't exist, which is fine in a live system
            batch.update(seatRef, { status: 'booked', booking_id: bookingId, temp_chat_id: admin.firestore.FieldValue.delete() });
        });

        batch.delete(db.collection('user_state').doc(String(chatId)));
        
        await batch.commit();

        await sendMessage(chatId, MESSAGES.booking_finish.replace('{bookingId}', bookingId).replace('{count}', booking.passengers.length), "Markdown");

    } catch (error) {
        console.error('❌ finalizeBooking error:', error.message);
        await unlockSeats(booking);
        await sendMessage(chatId, MESSAGES.db_error + " Booking failed. Seats were released.");
    }
}


/* --------------------- Manager Flow Handlers ---------------------- */

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
                
                const userDoc = await db.collection('users').doc(String(chatId)).get();
                const ownerName = userDoc.exists ? userDoc.data().name : 'System Owner';

                // --- DYNAMIC COLLECTION CREATION HERE ---
                await db.collection('buses').doc(data.busID).set({
                    bus_id: data.busID,
                    owner: ownerName,
                    from: data.route.split(' to ')[0].trim(),
                    to: data.route.split(' to ')[1].trim(),
                    departure_time: new Date().toISOString().split('T')[0] + " 10:00", 
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


/* --------------------- Shared Helper Functions ---------------------- */

// State management helpers
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

async function getUserRole(chatId) {
    try {
        const db = getFirebaseDb();
        const doc = await db.collection('users').doc(String(chatId)).get();
        if (doc.exists) return doc.data().role;
        return 'unregistered';
    } catch (e) {
        return 'error';
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


/* --------------------- Telegram Axios Helpers ---------------------- */

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
    // Suppress minor errors
  }
}

async function answerCallbackQuery(callbackQueryId) {
  try {
    await axios.post(`${TELEGRAM_API}/answerCallbackQuery`, { callback_query_id: callbackQueryId });
  } catch (error) {
    // Suppress minor errors
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
