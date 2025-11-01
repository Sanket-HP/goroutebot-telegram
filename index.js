// Import the libraries we installed
const express = require('express');
const axios = require('axios');
const admin = require('firebase-admin');
const Razorpay = require('razorpay'); 
const crypto = require('crypto');

// --- Configuration ---
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN; 
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;
const RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET;

// --- Razorpay Initialization ---
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
});

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
    registration_started: "✅ Great! Your role is set to *{role}*.\n\nTo complete your profile, please provide your details in this format:\n\n\`my profile details [Your Full Name] / [Your Aadhar Number] / [Your Phone Number]\`", 
    profile_updated: "✅ *Profile Updated!* Your details have been saved.",
    profile_update_error: "❌ *Error!* Please use the correct format:\n\`my profile details [Name] / [Aadhar Number] / [Phone Number]\`", 
    user_not_found: "❌ User not found. Please send /start to register.",

    // Phone Update
    update_phone_prompt: "📞 *Update Phone:* Please enter your new 10-digit phone number now.",
    phone_updated_success: "✅ Phone number updated successfully!",
    phone_invalid: "❌ Invalid phone number. Please enter a 10-digit number only.",

    // Booking
    booking_type_prompt: "👤 *Booking Seats:* Please select your booking type:",
    gender_prompt: "🚻 *Seat Safety:* Is the passenger booking seat {seatNo} a Male or Female?",
    safety_violation: "🚫 *Seat Safety Violation:* A male cannot book seat {seatNo} as it is next to a female-occupied seat. Please choose another seat.",
    details_prompt: "✍️ *Passenger Details:* Please enter the passenger's Name, Age, and Aadhar number in this format:\n\`[Name] / [Age] / [Aadhar Number]\`",
    booking_passenger_prompt: "✅ Details saved for seat {seatNo}.\n\n*What's next?*",
    booking_finish: "🎫 *Booking Confirmed!* Your seats are reserved.\n\n*Booking ID:* {bookingId}\n*Total Seats:* {count}\n\nThank you for choosing GoRoute!\n\nYour E-Ticket has been successfully processed.", 
    booking_details_error: "❌ *Error!* Please provide details in the format: \`[Name] / [Age] / [Aadhar Number]\`",
    seat_not_available: "❌ Seat {seatNo} on bus {busID} is already booked or invalid.",
    no_bookings: "📭 You don't have any active bookings.",
    booking_cancelled: "🗑️ *Booking Cancelled*\n\nBooking {bookingId} has been cancelled successfully.\n\nYour refund will be processed and credited within 6 hours of *{dateTime}*.", 
    
    // Payment
    payment_required: "💰 *Payment Required:* Total Amount: ₹{amount} INR.\n\n*Order ID: {orderId}*\n\n[Click here to pay]({paymentUrl})\n\n*(Note: Your seat is held for 15 minutes. The ticket will be automatically sent upon successful payment.)*",
    payment_awaiting: "⏳ Your seat is still locked while we await payment confirmation from Razorpay (Order ID: {orderId}).",
    payment_failed: "❌ Payment verification failed. Your seats have been released. Please try booking again.",

    // Manager
    manager_add_bus_init: "📝 *Bus Creation:* Enter the **Bus Number** (e.g., `MH-12 AB 1234`):",
    manager_add_bus_number: "🚌 Enter the **Bus Name** (e.g., `Sharma Travels`):",
    manager_add_bus_route: "📍 Enter the Route (e.g., `Delhi to Jaipur`):",
    manager_add_bus_price: "💰 Enter the Base Price (e.g., `850`):",
    manager_add_bus_type: "🛋️ Enter the **Bus Seating Layout** (e.g., `Seater`, `Sleeper`, or `Both`):",
    manager_add_seat_type: "🪑 Enter the seat type for **Row {row}** (e.g., `Sleeper Upper`, `Sleeper Lower`, or `Seater`):",
    manager_add_bus_depart_date: "📅 Enter the Departure Date (YYYY-MM-DD, e.g., `2025-12-25`):",
    manager_add_bus_depart_time: "🕒 Enter the Departure Time (HH:MM, 24h format, e.g., `08:30`):",
    manager_add_bus_arrive_time: "🕡 Enter the Estimated Arrival Time (HH:MM, 24h format, e.g., `18:00`):",
    manager_add_bus_manager_phone: "📞 *Final Step:* Enter your Phone Number to associate with the bus:",
    manager_bus_saved: "✅ *Bus {busID} created!* Route: {route}. Next, add seats: \n\n*Next Step:* Now, create all seats for this bus by typing:\n`add seats {busID} 40`",
    manager_seats_saved: "✅ *Seats Added!* 40 seats have been created for bus {busID} and marked available. You can now use `show seats {busID}`.",
    manager_seats_invalid: "❌ Invalid format. Please use: `add seats [BUSID] [COUNT]`",
    manager_invalid_layout: "❌ Invalid layout. Please enter `Seater`, `Sleeper`, or `Both`.",
    manager_invalid_seat_type: "❌ Invalid seat type. Please enter `Sleeper Upper`, `Sleeper Lower`, or `Seater`.",

    // Tracking
    tracking_manager_prompt: "📍 *Live Tracking Setup:* Enter the Bus ID you wish to track/update (e.g., `BUS101`).",
    tracking_manager_enabled: "✅ *Tracking Enabled for {busID}*.\n\nTo update the location every 15 minutes, the manager must:\n1. Keep their *mobile location enabled*.\n2. The external Cron Job must be running.",
    tracking_not_found: "❌ Bus {busID} not found or tracking is not active.",
    tracking_passenger_info: "🚍 *Live Tracking - {busID}*\n\n📍 *Last Location:* {location}\n🕒 *Last Updated:* {time}\n\n_Note: Location updates every 15 minutes_",

    // Notifications
    manager_notification_booking: "🔔 *NEW BOOKING CONFIRMED!*\n\nBus: {busID}\nSeats: {seats}\nPassenger: {passengerName}\nTime: {dateTime}",
    manager_notification_cancellation: "⚠️ *BOOKING CANCELLED*\n\nBooking ID: {bookingId}\nBus: {busID}\nSeats: {seats}\nTime: {dateTime}",

    // General
    db_error: "❌ CRITICAL ERROR: The bot's database is not connected. Please contact support.",
    unknown_command: "🤔 I don't understand that command. Type */help* for a list of available options.",
    sync_setup_init: "📝 *Inventory Sync Setup:* Enter the Bus ID you wish to synchronize (e.g., `BUS101`).",
    sync_setup_url: "🔗 Enter the **OSP API Endpoint** (the external URL for inventory data) for bus {busID}:",
    sync_success: "✅ *Inventory Sync Setup Successful!* Bus {busID} is now configured to pull data from {url}.",
};

// Create the server
const app = express();
// The Razorpay webhook requires raw body parsing for signature verification
app.use(express.json({ verify: (req, res, buf) => { req.rawBody = buf; } }));

// --- Database Initialization ---
let db; 

function getFirebaseDb() {
    if (db) return db;

    try {
        const rawCredsBase64 = process.env.FIREBASE_CREDS_BASE64;
        if (!rawCredsBase64) {
            throw new Error("CRITICAL: FIREBASE_CREDS_BASE64 is not defined in Vercel Environment Variables.");
        }
        
        const jsonString = Buffer.from(rawCredsBase64, 'base64').toString('utf8');
        const serviceAccount = JSON.parse(jsonString);

        try {
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount)
            });
        } catch (error) {
            if (!error.message.includes("default Firebase app already exists")) {
                throw error;
            }
        }
        
        db = admin.firestore();
        console.log("✅ Firebase DB initialized successfully.");
        return db;

    } catch (e) {
        console.error("CRITICAL FIREBASE ERROR", e.message);
        // Rethrow the error so the calling function can handle it gracefully.
        throw e; 
    }
}

/* --------------------- Telegram Axios Helpers ---------------------- */

async function sendMessage(chatId, text, parseMode = null, replyMarkup = null) {
    if (!TELEGRAM_TOKEN) {
        console.error("❌ CRITICAL: TELEGRAM_TOKEN environment variable is missing. Cannot send message.");
        return; 
    }
    try {
        const payload = { chat_id: chatId, text: text, parse_mode: parseMode };
        if (replyMarkup) payload.reply_markup = replyMarkup;
        await axios.post(`${TELEGRAM_API}/sendMessage`, payload);
    } catch (error) {
        if (error.response) {
            console.error(`❌ TELEGRAM API ERROR for ${chatId}. Status: ${error.response.status}. Data: ${JSON.stringify(error.response.data)}`);
            if (error.response.data.description && error.response.data.description.includes('bot was blocked by the user')) {
                console.error(`--- FATAL: User ${chatId} has blocked the bot. Cannot send messages. ---`);
            }
        } else if (error.request) {
            console.error(`❌ TELEGRAM NETWORK ERROR for ${chatId}: No response received. Message: ${error.message}`);
        } else {
            console.error(`❌ TELEGRAM SETUP ERROR for ${chatId}: ${error.message}`);
        }
    }
}

async function sendChatAction(chatId, action) {
    try {
        await axios.post(`${TELEGRAM_API}/sendChatAction`, { chat_id: chatId, action: action });
    } catch (error) {
        if (error.response) {
            console.error(`❌ CRITICAL TELEGRAM ACTION ERROR for ${chatId}. Status: ${error.response.status}. Data: ${JSON.stringify(error.response.data)}`);
        } else {
            console.error(`❌ CRITICAL TELEGRAM ACTION NETWORK ERROR for ${chatId}: ${error.message}`);
        }
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

/* --------------------- Shared Helper Functions ---------------------- */

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

async function unlockSeats(booking) {
    try {
        const db = getFirebaseDb();
        const batch = db.batch();
        booking.seats.forEach(seat => {
            const seatRef = db.collection('seats').doc(`${booking.busID}-${seat.seatNo}`);
            batch.update(seatRef, { status: 'available', temp_chat_id: admin.firestore.FieldValue.delete(), gender: admin.firestore.FieldValue.delete() });
        });
        await batch.commit();
    } catch (e) {
        console.error("CRITICAL: Failed to unlock seats:", e.message);
    }
}

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

async function sendManagerNotification(busID, type, details) {
    try {
        const db = getFirebaseDb();
        const busDoc = await db.collection('buses').doc(busID).get();
        
        if (!busDoc.exists || !busDoc.data().tracking_manager_id) return; 

        const managerChatId = busDoc.data().tracking_manager_id;
        const now = details.dateTime;

        let notificationText = '';
        if (type === 'BOOKING') {
            const seatList = details.seats.map(s => s.seatNo).join(', ');
            notificationText = MESSAGES.manager_notification_booking
                .replace('{busID}', busID)
                .replace('{seats}', seatList)
                .replace('{passengerName}', details.passengerName)
                .replace('{dateTime}', now);
        } else if (type === 'CANCELLATION') {
            const seatsList = details.seats.join(', ');
            notificationText = MESSAGES.manager_notification_cancellation
                .replace('{bookingId}', details.bookingId)
                .replace('{busID}', busID)
                .replace('{seats}', seatsList)
                .replace('{dateTime}', now);
        }

        if (notificationText) {
            await sendMessage(managerChatId, notificationText, "Markdown");
        }
    } catch (e) {
        console.error("Error sending manager notification:", e.message);
    }
}

/* --------------------- Live Tracking Cron Logic ---------------------- */

// This function is executed by the external Vercel Cron Job
async function sendLiveLocationUpdates() {
    const db = getFirebaseDb();
    const updates = [];
    let updatesSent = 0;

    try {
        // Find all buses that have a manager assigned (meaning tracking is enabled)
        const busesSnapshot = await db.collection('buses').where('tracking_manager_id', '!=', null).get();

        const currentTime = new Date();
        const notificationTime = currentTime.toLocaleTimeString('en-IN');
        const mockLocation = ["New Delhi Station", "Mumbai Central", "Pune Junction", "Jaipur Highway", "Bus is en route"];
        
        // Loop through all active tracking buses
        busesSnapshot.forEach(busDoc => {
            const data = busDoc.data();
            const busID = data.bus_id;
            const managerId = data.tracking_manager_id;
            
            // Generate a random mock location
            const randomLocation = mockLocation[Math.floor(Math.random() * mockLocation.length)];

            // Update the bus document with a new, mock location and time
            busDoc.ref.update({
                last_location_time: admin.firestore.FieldValue.serverTimestamp(),
                last_location_name: randomLocation
            });

            // 1. Notify the Manager (as proof the cron job ran)
            const managerNotification = MESSAGES.tracking_passenger_info
                .replace('{busID}', busID)
                .replace('{location}', randomLocation)
                .replace('{time}', notificationTime);
            
            updates.push(sendMessage(managerId, `🔔 [CRON UPDATE] ${managerNotification}`, "Markdown"));
            updatesSent++;

            // 2. NOTE: In a production system, you would query the 'bookings' collection here
            // to find and notify every passenger of this bus.
        });

        await Promise.all(updates);
        return { updatesSent };

    } catch (error) {
        console.error("CRON JOB FAILED during update loop:", error.message);
        throw error;
    }
}

/* --------------------- Razorpay Webhook Verification ---------------------- */

/**
 * Helper function to verify Razorpay signature using HMAC-SHA256.
 */
function verifyRazorpaySignature(payload, signature) {
    if (!RAZORPAY_WEBHOOK_SECRET) {
        console.warn("RAZORPAY_WEBHOOK_SECRET is not set. Skipping signature verification.");
        return true;
    }
    const expectedSignature = crypto.createHmac('sha256', RAZORPAY_WEBHOOK_SECRET)
        .update(payload)
        .digest('hex');
    
    return expectedSignature === signature;
}

/* --------------------- Core Handlers ---------------------- */

async function getUserRole(chatId) {
    try {
        const db = getFirebaseDb();
        const doc = await db.collection('users').doc(String(chatId)).get();
        if (doc.exists) return doc.data().role;
        return 'unregistered';
    } catch (e) {
        // Critical DB failure
        console.error('Error fetching user role, assuming error:', e.message);
        return 'error'; 
    }
}

async function sendHelpMessage(chatId) {
    try {
        const db = getFirebaseDb();
        const userDoc = await db.collection('users').doc(String(chatId)).get();
        const userRole = userDoc.exists ? userDoc.data().role : 'unregistered';
        
        let baseButtons = [];

        if (userRole === 'manager' || userRole === 'owner') {
            baseButtons = [
                [{ text: "➕ Add New Bus", callback_data: "cb_add_bus_manager" }],
                [{ text: "🔗 Setup Inventory Sync", callback_data: "cb_inventory_sync" }],
                [{ text: "🚌 View Schedules", callback_data: "cb_book_bus" }],
            ];
        } else {
            baseButtons = [
                [{ text: "🚌 Book a Bus", callback_data: "cb_book_bus" }],
                [{ text: "🎫 My Bookings", callback_data: "cb_my_booking" }],
            ];
        }
        
        let finalButtons = baseButtons;
        
        if (userDoc.exists) {
            finalButtons.push([{ text: "📞 Update Phone", callback_data: "cb_update_phone" }, { text: "👤 My Profile", callback_data: "cb_my_profile" }]);
        } else {
            finalButtons.push([{ text: "👤 My Profile", callback_data: "cb_my_profile" }]);
        }
        
        finalButtons.push([{ text: "ℹ️ Help / Status", callback_data: "cb_status" }]);

        const keyboard = { inline_keyboard: finalButtons };

        await sendMessage(chatId, MESSAGES.help, "Markdown", keyboard);
    } catch (e) {
        // Fallback if DB fails during help message construction
        console.error("❌ sendHelpMessage failed:", e.message);
        await sendMessage(chatId, "❌ Database error when loading help menu. Please try /start again.");
    }
}

/* --------------------- General Handlers ---------------------- */

async function handleUpdatePhoneNumberCallback(chatId) {
    const userRole = await getUserRole(chatId);
    if (userRole === 'unregistered' || userRole === 'error') {
        return await sendMessage(chatId, "❌ You must register first to update your profile. Send /start.");
    }
    
    try {
        await saveAppState(chatId, 'AWAITING_NEW_PHONE', {});
        await sendMessage(chatId, MESSAGES.update_phone_prompt, "Markdown");
    } catch (e) {
        await sendMessage(chatId, MESSAGES.db_error + " Could not initiate phone update.");
    }
}

async function handlePhoneUpdateInput(chatId, text) {
    const phoneRegex = /^\d{10}$/;
    const phoneNumber = text.replace(/[^0-9]/g, '');

    if (!phoneNumber.match(phoneRegex)) {
        return await sendMessage(chatId, MESSAGES.phone_invalid, "Markdown");
    }
    
    try {
        const db = getFirebaseDb();
        await db.collection('users').doc(String(chatId)).update({ phone: phoneNumber });
        
        await saveAppState(chatId, 'IDLE', {});
        await sendMessage(chatId, MESSAGES.phone_updated_success, "Markdown");
        await handleUserProfile(chatId);
        
    } catch (error) {
        console.error('❌ Phone Update Error:', error.message);
        await sendMessage(chatId, MESSAGES.db_error + " Could not save phone number.");
    }
}

async function showAvailableBuses(chatId) {
    try {
        const db = getFirebaseDb();
        const snapshot = await db.collection('buses').get();
        const buses = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            buses.push({
                busID: data.bus_id, from: data.from, to: data.to,
                date: data.departure_time.split(' ')[0], time: data.departure_time.split(' ')[1],
                owner: data.owner, price: data.price, busType: data.bus_type,
                rating: data.rating || 4.2, availableSeats: data.total_seats || 40 
            });
        });

        if (buses.length === 0) return await sendMessage(chatId, MESSAGES.no_buses, "Markdown");

        let response = `🚌 *Available Buses* 🚌\n\n`;
        buses.forEach((bus, index) => {
            response += `*${index + 1}. ${bus.busID}* - ${bus.owner}\n`;
            response += `📍 ${bus.from} → ${bus.to}\n`;
            response += `📅 ${bus.date} 🕒 ${bus.time}\n`;
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

async function handleBusSearch(chatId) {
    const keyboard = {
        inline_keyboard: [
            [{ text: "🧍 Single Passenger", callback_data: "cb_booking_single" }],
            [{ text: "🧑‍🤝‍🧑 Couple / Husband-Wife (WIP)", callback_data: "cb_booking_couple" }],
            [{ text: "👪 Family / Group (WIP)", callback_data: "cb_booking_family" }],
        ]
    };
    await sendMessage(chatId, MESSAGES.booking_type_prompt, "Markdown", keyboard);
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
        
        const refundTime = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

        const batch = db.batch();
        const bookingData = bookingDoc.data();

        batch.update(bookingRef, { status: 'cancelled', cancelled_at: admin.firestore.FieldValue.serverTimestamp() });

        bookingData.seats.forEach(seatNo => {
            const seatRef = db.collection('seats').doc(`${bookingData.bus_id}-${seatNo}`);
            batch.update(seatRef, { status: 'available', booking_id: admin.firestore.FieldValue.delete(), temp_chat_id: admin.firestore.FieldValue.delete(), gender: admin.firestore.FieldValue.delete() });
        });

        await batch.commit();
        
        await sendMessage(chatId, MESSAGES.booking_cancelled.replace('{bookingId}', bookingId).replace('{dateTime}', refundTime), "Markdown");
        
        await sendManagerNotification(bookingData.bus_id, 'CANCELLATION', { 
            bookingId: bookingId,
            seats: bookingData.seats,
            dateTime: refundTime
        });

    } catch (e) {
        console.error('❌ Cancellation error:', e.message);
        await sendMessage(chatId, MESSAGES.db_error);
    }
}

async function startUserRegistration(chatId, user) {
    try {
        const db = getFirebaseDb(); // Try to get DB
        console.log(`[START FLOW] User ${chatId}: Attempting to read user document.`);
        
        const doc = await db.collection('users').doc(String(chatId)).get();

        if (doc.exists) {
           console.log(`[START FLOW] User ${chatId}: Found existing user. Sending welcome back.`);
           const userName = user.first_name || 'User'; 
           await sendMessage(chatId, MESSAGES.welcome_back.replace('{name}', userName));
           await sendHelpMessage(chatId); 
        } else {
            console.log(`[START FLOW] User ${chatId}: New user. Sending role prompt.`);
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
        console.error(`❌ CRITICAL /start error for ${chatId}:`, error.message);
        // If DB fails here, the user receives a more detailed generic DB error.
        await sendMessage(chatId, MESSAGES.db_error + " (Check FIREBASE_CREDS_BASE64/Permissions. Error: " + error.message + ")");
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
        const match = text.match(/my profile details\s+([^\/]+)\s*\/\s*(\d+)\s*\/\s*(\d+)/i);
        
        if (!match) {
            await sendMessage(chatId, MESSAGES.profile_update_error, "Markdown");
            return;
        }
        const name = match[1].trim();
        const aadhar = match[2].trim();
        const phone = match[3].trim();

        const db = getFirebaseDb();
        const userRef = db.collection('users').doc(String(chatId));
        const doc = await userRef.get();

        if (!doc.exists) {
            await sendMessage(chatId, MESSAGES.user_not_found);
            return;
        }
        
        await userRef.update({ name: name, aadhar: aadhar, phone: phone, status: 'active' });
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

/* --------------------- Seat/Booking Logic ---------------------- */

async function checkSeatSafety(busID, seatNo, requestedGender) {
    if (requestedGender === 'F') return true;

    const db = getFirebaseDb();
    
    const column = seatNo.slice(-1);
    const row = seatNo.slice(0, -1);
    let adjacentSeatNo = null;

    if (column === 'A') adjacentSeatNo = row + 'B';
    else if (column === 'B') adjacentSeatNo = row + 'A';
    else if (column === 'C') adjacentSeatNo = row + 'D';
    else if (column === 'D') adjacentSeatNo = row + 'C';
    
    if (!adjacentSeatNo) return true;

    const adjacentDoc = await db.collection('seats').doc(`${busID}-${adjacentSeatNo}`).get();
    
    if (adjacentDoc.exists) {
        const data = adjacentDoc.data();
        if (data.status !== 'available' && data.gender === 'F') {
            return false;
        }
    }
    
    return true;
}

async function handleSeatMap(chatId, text) {
    try {
        const busMatch = text.match(/(BUS\d+)/i);
        const busID = busMatch ? busMatch[1].toUpperCase() : null;
        
        if (!busID) return await sendMessage(chatId, MESSAGES.specify_bus_id, "Markdown");

        const busInfo = await getBusInfo(busID);
        if (!busInfo) return await sendMessage(chatId, MESSAGES.seat_map_error.replace('{busID}', busID), "Markdown");

        const db = getFirebaseDb();
        const seatsSnapshot = await db.collection('seats').where('bus_id', '==', busID).get();
        const seatStatus = {};
        let availableCount = 0;
        
        seatsSnapshot.forEach(doc => {
            const data = doc.data();
            seatStatus[data.seat_no] = data;
            if (data.status === 'available') availableCount++;
        });

        let seatMap = `🚍 *Seat Map - ${busID}*\n`;
        seatMap += `📍 ${busInfo.from} → ${busInfo.to}\n`;
        seatMap += `📅 ${busInfo.date} 🕒 ${busInfo.time}\n\n`;
        seatMap += `Legend: 🟩 Available • ⚫M Booked Male • ⚫F Booked Female\n\n`;

        for (let row = 1; row <= 10; row++) {
            let line = '';
            for (let col of ['A', 'B', 'C', 'D']) {
                const seatNo = `${row}${col}`;
                const data = seatStatus[seatNo] || {}; 
                const status = data.status || '⬜́'; 
                
                let display = '⬜́';
                if (status === 'available') {
                    display = `🟩${seatNo}`;
                } else if (status === 'booked' || status === 'locked') {
                    const genderTag = data.gender === 'F' ? 'F' : 'M';
                    display = `⚫${seatNo}${genderTag}`;
                } 
                
                line += `${display}`;
                if (col === 'B') {
                    line += `     🚌     `;
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

        const bookingData = {
            busID,
            seatNo,
            passengers: [],
        };
        await saveAppState(chatId, 'AWAITING_GENDER_SELECTION', bookingData);
        
        const keyboard = {
            inline_keyboard: [
                [{ text: "🚹 Male", callback_data: `cb_select_gender_M` }],
                [{ text: "🚺 Female", callback_data: `cb_select_gender_F` }],
            ]
        };
        await sendMessage(chatId, MESSAGES.gender_prompt.replace('{seatNo}', seatNo), "Markdown", keyboard);
        
    } catch (error) {
        console.error('❌ handleSeatSelection error:', error.message);
        await sendMessage(chatId, MESSAGES.db_error);
    }
}

async function handleGenderSelectionCallback(chatId, callbackData) {
    try {
        const gender = callbackData.split('_').pop();
        const state = await getAppState(chatId);
        const { busID, seatNo } = state.data;
        
        if (gender === 'M') {
            const isSafe = await checkSeatSafety(busID, seatNo, gender);
            if (!isSafe) {
                await saveAppState(chatId, 'IDLE', {});
                return await sendMessage(chatId, MESSAGES.safety_violation.replace('{seatNo}', seatNo), "Markdown");
            }
        }
        
        const db = getFirebaseDb();
        await db.collection('seats').doc(`${busID}-${seatNo}`).update({ 
            status: 'locked', 
            temp_chat_id: String(chatId),
            gender: gender
        });
        
        state.data.gender = gender;
        state.data.seats = [{ seatNo, status: 'locked', gender: gender }];
        state.data.currentSeatIndex = 0; 

        await saveAppState(chatId, 'AWAITING_PASSENGER_DETAILS', state.data);

        await sendMessage(chatId, MESSAGES.details_prompt, "Markdown");
        
    } catch (error) {
        console.error('❌ handleGenderSelectionCallback error:', error.message);
        await saveAppState(chatId, 'IDLE', {});
        await sendMessage(chatId, MESSAGES.db_error);
    }
}

async function handleBookingInput(chatId, text, state) {
    const booking = state.data;
    
    if (state.state === 'AWAITING_PASSENGER_DETAILS') {
        const passengerMatch = text.match(/([^\/]+)\s*\/\s*(\d+)\s*\/\s*(\d+)/i);
        if (!passengerMatch) return await sendMessage(chatId, MESSAGES.booking_details_error, "Markdown");

        const name = passengerMatch[1].trim();
        const age = passengerMatch[2].trim();
        const aadhar = passengerMatch[3].trim();
        
        booking.passengers.push({ name, age, aadhar, gender: booking.gender, seat: booking.seatNo });
        
        await saveAppState(chatId, 'AWAITING_BOOKING_ACTION', booking);
        
        const keyboard = {
            inline_keyboard: [
                [{ text: "➕ Add Another Passenger", callback_data: "cb_add_passenger" }],
                [{ text: "✅ Complete Booking", callback_data: "cb_book_finish" }]
            ]
        };
        await sendMessage(chatId, MESSAGES.booking_passenger_prompt.replace('{count}', booking.passengers.length).replace('{seatNo}', booking.seatNo), "Markdown", keyboard);
        
        return;
    }
    
    await sendMessage(chatId, "Please use the provided buttons to continue (Add Another Passenger or Complete Booking).", "Markdown");
}

async function handleAddPassengerCallback(chatId) {
    try {
        const state = await getAppState(chatId);
        const booking = state.data;
        
        if (state.state !== 'AWAITING_BOOKING_ACTION') return await sendMessage(chatId, "❌ Please start a new booking first (Book seat BUS ID).");
        
        return await sendMessage(chatId, MESSAGES.feature_wip + " Multi-passenger booking requires selecting a new seat first.", "Markdown");

    } catch (error) {
        console.error('❌ handleAddPassengerCallback error:', error.message);
        await sendMessage(chatId, MESSAGES.db_error);
    }
}

async function createPaymentOrder(chatId, booking) {
    try {
        const pricePerSeat = 45000;
        const totalAmount = booking.passengers.length * pricePerSeat;
        const bookingId = 'BOOK' + Date.now();

        const order = await razorpay.orders.create({
            amount: totalAmount,
            currency: "INR",
            receipt: bookingId, 
        });

        booking.razorpay_order_id = order.id;
        booking.total_amount = totalAmount;
        booking.bookingId = bookingId;
        booking.chat_id = String(chatId);

        await saveAppState(chatId, 'AWAITING_PAYMENT', booking);
        
        const db = getFirebaseDb();
        await db.collection('payment_sessions').doc(order.id).set({
            booking: booking,
            created_at: admin.firestore.FieldValue.serverTimestamp()
        });
        
        const paymentUrl = `https://rzp.io/i/${order.id}`;
        
        await sendMessage(chatId, 
            MESSAGES.payment_required.replace('{amount}', (totalAmount / 100).toFixed(2)).replace('{paymentUrl}', paymentUrl).replace('{orderId}', order.id), 
            "Markdown");

    } catch (error) {
        console.error('❌ Payment Order Creation Error:', error.message);
        await unlockSeats(booking);
        await sendMessage(chatId, MESSAGES.db_error + " Failed to create payment order. Seats were released.");
    }
}

async function commitFinalBookingBatch(chatId, booking) {
    const db = getFirebaseDb();
    const batch = db.batch();
    const dateTime = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

    const bookingRef = db.collection('bookings').doc(booking.bookingId);
    batch.set(bookingRef, {
        booking_id: booking.bookingId,
        chat_id: String(chatId),
        bus_id: booking.busID,
        passengers: booking.passengers,
        seats: booking.seats.map(s => s.seatNo),
        status: 'confirmed',
        total_seats: booking.passengers.length,
        total_paid: booking.total_amount,
        razorpay_order_id: booking.razorpay_order_id,
        created_at: admin.firestore.FieldValue.serverTimestamp()
    });

    booking.seats.forEach(seat => {
        const seatRef = db.collection('seats').doc(`${booking.busID}-${seat.seatNo}`);
        batch.update(seatRef, { 
            status: 'booked', 
            booking_id: booking.bookingId, 
            temp_chat_id: admin.firestore.FieldValue.delete() 
        });
    });

    batch.delete(db.collection('user_state').doc(String(chatId)));
    batch.delete(db.collection('payment_sessions').doc(booking.razorpay_order_id));
    
    await batch.commit();

    await sendManagerNotification(booking.busID, 'BOOKING', { 
        seats: booking.seats,
        passengerName: booking.passengers[0].name,
        dateTime: dateTime
    });

    await sendMessage(chatId, MESSAGES.booking_finish.replace('{bookingId}', booking.bookingId).replace('{count}', booking.passengers.length), "Markdown");
}

async function handlePaymentVerification(chatId, booking) {
    try {
        await commitFinalBookingBatch(chatId, booking);
        
    } catch (error) {
        console.error('❌ Payment Verification Error:', error.message);
        await sendMessage(chatId, MESSAGES.payment_failed);
    }
}

/* --------------------- Manager Flow Handlers ---------------------- */

async function handleManagerAddBus(chatId) {
    try {
        const userRole = await getUserRole(chatId);
        if (userRole !== 'manager' && userRole !== 'owner') {
             return await sendMessage(chatId, "❌ You do not have permission to add buses.");
        }
        
        await saveAppState(chatId, 'MANAGER_ADD_BUS_NUMBER', {});
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

    const timeRegex = /^\d{2}:\d{2}$/;
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    const phoneRegex = /^\d{10}$/;
    const validLayouts = ['seater', 'sleeper', 'both'];
    const validSeatTypes = ['sleeper upper', 'sleeper lower', 'seater'];

    try {
        switch (state.state) {
            case 'MANAGER_ADD_BUS_NUMBER': 
                data.busNumber = text.toUpperCase().replace(/[^A-Z0-9\s-]/g, '');
                if (!data.busNumber) return await sendMessage(chatId, "❌ Invalid Bus Number. Try again:", "Markdown");
                
                nextState = 'MANAGER_ADD_BUS_NAME';
                response = MESSAGES.manager_add_bus_number;
                break;
                
            case 'MANAGER_ADD_BUS_NAME':
                data.busName = text;
                nextState = 'MANAGER_ADD_BUS_ROUTE';
                response = MESSAGES.manager_add_bus_route;
                break;

            case 'MANAGER_ADD_BUS_PRICE':
                data.price = parseFloat(text.replace(/[^0-9.]/g, ''));
                if (isNaN(data.price)) return await sendMessage(chatId, "❌ Invalid price. Enter a number (e.g., 850):", "Markdown");
                
                nextState = 'MANAGER_ADD_BUS_TYPE';
                response = MESSAGES.manager_add_bus_type;
                break;
                
            case 'MANAGER_ADD_BUS_TYPE':
                data.busLayout = text.toLowerCase().trim();
                if (!validLayouts.includes(data.busLayout)) return await sendMessage(chatId, MESSAGES.manager_invalid_layout, "Markdown");

                data.seatsToConfigure = [];
                
                if (data.busLayout === 'seater' || data.busLayout === 'sleeper' || data.busLayout === 'both') {
                    data.currentRow = 1;
                    nextState = 'MANAGER_ADD_SEAT_TYPE';
                    response = MESSAGES.manager_add_seat_type.replace('{row}', data.currentRow);
                } else {
                    nextState = 'MANAGER_ADD_BUS_DEPART_DATE';
                    response = MESSAGES.manager_add_bus_depart_date;
                }
                break;
                
            case 'MANAGER_ADD_SEAT_TYPE':
                const seatTypeInput = text.toLowerCase().trim();
                const isValidSeatType = validSeatTypes.includes(seatTypeInput);

                if (!isValidSeatType) return await sendMessage(chatId, MESSAGES.manager_invalid_seat_type, "Markdown");

                data.seatsToConfigure.push({
                    row: data.currentRow,
                    type: seatTypeInput
                });

                data.currentRow++;
                
                if (data.currentRow <= 10) {
                    nextState = 'MANAGER_ADD_SEAT_TYPE';
                    response = MESSAGES.manager_add_seat_type.replace('{row}', data.currentRow);
                } else {
                    nextState = 'MANAGER_ADD_BUS_DEPART_DATE';
                    response = MESSAGES.manager_add_bus_depart_date;
                }
                break;
                
            case 'MANAGER_ADD_BUS_DEPART_DATE':
                if (!text.match(dateRegex)) return await sendMessage(chatId, "❌ Invalid date format (YYYY-MM-DD). Try again:", "Markdown");
                data.departDate = text;
                nextState = 'MANAGER_ADD_BUS_DEPART_TIME';
                response = MESSAGES.manager_add_bus_depart_time;
                break;
                
            case 'MANAGER_ADD_BUS_DEPART_TIME':
                if (!text.match(timeRegex)) return await sendMessage(chatId, "❌ Invalid time format (HH:MM). Try again:", "Markdown");
                data.departTime = text;
                nextState = 'MANAGER_ADD_BUS_ARRIVE_TIME';
                response = MESSAGES.manager_add_bus_arrive_time;
                break;

            case 'MANAGER_ADD_BUS_ARRIVE_TIME':
                if (!text.match(timeRegex)) return await sendMessage(chatId, "❌ Invalid time format (HH:MM). Try again:", "Markdown");
                data.arriveTime = text;
                nextState = 'MANAGER_ADD_BUS_MANAGER_PHONE';
                response = MESSAGES.manager_add_bus_manager_phone;
                break;

            case 'MANAGER_ADD_BUS_MANAGER_PHONE':
                data.managerPhone = text.replace(/[^0-9]/g, '');
                if (!data.managerPhone.match(phoneRegex)) return await sendMessage(chatId, "❌ Invalid Phone Number. Enter a 10-digit number:", "Markdown");
                
                const userDoc = await db.collection('users').doc(String(chatId)).get();
                const ownerName = userDoc.exists ? userDoc.data().name : 'System Owner';

                const uniqueBusId = `BUS${Date.now()}`;
                
                if (userDoc.exists) {
                    await db.collection('users').doc(String(chatId)).update({
                        phone: data.managerPhone
                    });
                }

                await db.collection('buses').doc(uniqueBusId).set({
                    bus_id: uniqueBusId,
                    bus_number: data.busNumber,
                    bus_name: data.busName,
                    owner: ownerName,
                    from: data.route.split(' to ')[0].trim(),
                    to: data.route.split(' to ')[1].trim(),
                    departure_time: `${data.departDate} ${data.departTime}`, 
                    arrival_time: data.arriveTime,
                    manager_phone: data.managerPhone,
                    price: data.price,
                    bus_type: data.busLayout,
                    seat_configuration: data.seatsToConfigure,
                    total_seats: 40, 
                    rating: 5.0,
                    status: 'scheduled'
                });
                
                await db.collection('user_state').doc(String(chatId)).delete(); 

                response = MESSAGES.manager_bus_saved
                    .replace('{busID}', uniqueBusId)
                    .replace('{busNumber}', data.busNumber)
                    .replace('{busName}', data.busName)
                    .replace('{route}', data.route)
                    .replace('{departDate}', data.departDate)
                    .replace('{departTime}', data.departTime)
                    .replace('{arriveTime}', data.arriveTime);
                await sendMessage(chatId, response, "Markdown");
                return;
        }

        await saveAppState(chatId, nextState, data);
        await sendMessage(chatId, response, "Markdown");

    } catch (error) {
        console.error('❌ Manager Input Flow Error:', error.message);
        await db.collection('user_state').doc(String(chatId)).delete();
        await sendMessage(chatId, MESSAGES.db_error + " Bus creation failed. Please try again.");
    }
}

async function handleAddSeatsCommand(chatId, text) {
    const match = text.match(/add seats\s+(BUS\d+)\s+(\d+)/i);
    if (!match) return await sendMessage(chatId, MESSAGES.manager_seats_invalid, "Markdown");

    const userRole = await getUserRole(chatId);
    if (userRole !== 'manager' && userRole !== 'owner') {
          return await sendMessage(chatId, "❌ You do not have permission to add seats.");
    }
    
    const busID = match[1].toUpperCase();
    const count = parseInt(match[2], 10);
    
    if (count > 40 || count < 1) return await sendMessage(chatId, "❌ Seat count must be between 1 and 40.");

    try {
        const db = getFirebaseDb();
        const busDoc = await db.collection('buses').doc(busID).get();
        if (!busDoc.exists) return await sendMessage(chatId, `❌ Bus ID ${busID} does not exist. Please create it first.`);
        
        const config = busDoc.data().seat_configuration || [];
        if (config.length === 0) return await sendMessage(chatId, `❌ Bus ${busID} configuration missing. Please start the bus creation process again.`);

        const batch = db.batch();
        let seatsAdded = 0;
        
        const seatCols = ['A', 'B', 'C', 'D'];
        
        for (const rowConfig of config) {
            if (seatsAdded >= count) break;
            
            const rowIndex = rowConfig.row;
            const seatType = rowConfig.type;
            
            for (let col of seatCols) {
                if (seatsAdded >= count) break;
                
                const seatNo = `${rowIndex}${col}`;
                const docId = `${busID}-${seatNo}`;
                const seatRef = db.collection('seats').doc(docId);
                
                batch.set(seatRef, {
                    bus_id: busID,
                    seat_no: seatNo,
                    status: 'available',
                    gender: null,
                    type: seatType,
                });
                seatsAdded++;
            }
        }
        
        await batch.commit();
        await sendMessage(chatId, MESSAGES.manager_seats_saved.replace('{busID}', busID), "Markdown");

    } catch (error) {
        console.error('❌ Add Seats Command Error:', error.message);
        await sendMessage(chatId, MESSAGES.db_error + " Seat creation failed.");
    }
}

async function handleInventorySyncSetup(chatId) {
    const userRole = await getUserRole(chatId);
    if (userRole !== 'manager' && userRole !== 'owner') {
          return await sendMessage(chatId, "❌ You do not have permission to manage inventory sync.");
    }
    
    await saveAppState(chatId, 'MANAGER_SYNC_SETUP_BUSID', {});
    await sendMessage(chatId, MESSAGES.sync_setup_init, "Markdown");
}

async function handleInventorySyncInput(chatId, text, state) {
    const db = getFirebaseDb();
    const data = state.data;
    let nextState = '';
    let response = '';
    const urlRegex = /^(http|https):\/\/[^ "]+$/;

    try {
        switch (state.state) {
            case 'MANAGER_SYNC_SETUP_BUSID':
                data.busID = text.toUpperCase().replace(/[^A-Z0-9]/g, '');
                const busDoc = await db.collection('buses').doc(data.busID).get();
                if (!busDoc.exists) return await sendMessage(chatId, `❌ Bus ID ${data.busID} does not exist. Please create it first.`);
                
                nextState = 'MANAGER_SYNC_SETUP_URL';
                response = MESSAGES.sync_setup_url.replace('{busID}', data.busID);
                break;
                
            case 'MANAGER_SYNC_SETUP_URL':
                data.syncUrl = text.trim();
                if (!data.syncUrl.match(urlRegex)) return await sendMessage(chatId, "❌ Invalid URL format. Must start with http:// or https://. Try again:");
                
                await db.collection('buses').doc(data.busID).update({
                    osp_api_endpoint: data.syncUrl,
                    sync_status: 'Pending Sync',
                    last_sync_attempt: admin.firestore.FieldValue.serverTimestamp()
                });
                
                await saveAppState(chatId, 'IDLE', {}); 

                response = MESSAGES.sync_success.replace('{busID}', data.busID).replace('{url}', data.syncUrl);
                await sendMessage(chatId, response, "Markdown");
                return;
        }

        await saveAppState(chatId, nextState, data);
        await sendMessage(chatId, response, "Markdown");

    } catch (error) {
        console.error('❌ Inventory Sync Flow Error:', error.message);
        await db.collection('user_state').doc(String(chatId)).delete(); 
        await sendMessage(chatId, MESSAGES.db_error + " Inventory sync setup failed. Please try again.");
    }
}

/* --------------------- Message Router ---------------------- */

async function handleUserMessage(chatId, text, user) {
    const textLower = text.toLowerCase().trim();

    // --- STATE MANAGEMENT CHECK (Highest Priority) ---
    let state;
    try {
        state = await getAppState(chatId);
    } catch (e) {
        // This means DB failed during state fetch.
        await sendMessage(chatId, MESSAGES.db_error + " (State check failed)");
        return;
    }

    if (state.state !== 'IDLE') {
        if (state.state.startsWith('AWAITING_PASSENGER') || state.state.startsWith('AWAITING_GENDER')) {
            await handleBookingInput(chatId, text, state);
        } else if (state.state.startsWith('MANAGER_ADD_BUS')) {
            await handleManagerInput(chatId, text, state);
        } else if (state.state.startsWith('MANAGER_LIVE_TRACKING')) { 
            await sendMessage(chatId, MESSAGES.feature_wip);
        } else if (state.state === 'AWAITING_NEW_PHONE') { 
            await handlePhoneUpdateInput(chatId, text);
        } else if (state.state.startsWith('MANAGER_SYNC_SETUP')) {
            await handleInventorySyncInput(chatId, text, state);
        } else if (state.state === 'AWAITING_PAYMENT' && textLower === 'paid') {
            await handlePaymentVerification(chatId, state.data);
            return;
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
    else if (textLower.startsWith('cancel booking')) {
        await handleCancellation(chatId, text);
    }
    else if (textLower.startsWith('my profile') || textLower === '/profile') {
        await handleUserProfile(chatId);
    }
    else if (textLower.startsWith('add seats')) {
        await handleAddSeatsCommand(chatId, text);
    }
    else if (textLower.startsWith('live tracking')) { 
        await sendMessage(chatId, MESSAGES.feature_wip);
    }
    else if (textLower === 'help' || textLower === '/help') {
        await sendHelpMessage(chatId);
    }
    else { 
        await sendMessage(chatId, MESSAGES.unknown_command, "Markdown");
    }
}

/* --------------------- Main Webhook Handler ---------------------- */

app.post('/api/webhook', async (req, res) => {
    const update = req.body;
    
    // --- CRITICAL INITIALIZATION CHECK ---
    // This ensures that if the DB fails to initialize (e.g., bad creds), 
    // we can still send a message back to the user.
    try {
        getFirebaseDb();
    } catch (e) {
        console.error("CRITICAL FIREBASE INITIALIZATION ERROR on webhook call:", e.message);
        if (update.message) {
            // Attempt to send a message using the raw token since DB is the issue
            await sendMessage(update.message.chat.id, MESSAGES.db_error + ". FIX: Check 'FIREBASE_CREDS_BASE64' variable in Vercel.");
        }
        return res.status(500).send('Initialization Error'); 
    }
    
    try {
        if (update.message && update.message.text) {
            const message = update.message;
            const chatId = message.chat.id;
            const text = message.text ? message.text.trim() : '';
            const user = message.from;
            
            // The user sees the 'typing' indicator almost instantly
            await sendChatAction(chatId, "typing"); 
            await handleUserMessage(chatId, text, user);
        
        } else if (update.callback_query) {
            const callback = update.callback_query;
            const chatId = callback.message.chat.id;
            const callbackData = callback.data;
            const messageId = callback.message.message_id;
            
            await answerCallbackQuery(callback.id);
            await editMessageReplyMarkup(chatId, messageId, null);

            await sendChatAction(chatId, "typing");

            // --- ROUTE CALLBACKS ---
            if (callbackData.startsWith('cb_register_role_')) {
                await handleRoleSelection(chatId, callback.from, callbackData);
            } else if (callbackData === 'cb_book_bus') {
                await handleBusSearch(chatId);
            } else if (callbackData === 'cb_booking_single') {
                await showAvailableBuses(chatId);
            } else if (callbackData === 'cb_my_booking') {
                await handleBookingInfo(chatId);
            } else if (callbackData === 'cb_my_profile') {
                await handleUserProfile(chatId);
            } else if (callbackData === 'cb_add_bus_manager') {
                await handleManagerAddBus(chatId);
            } else if (callbackData === 'cb_start_tracking') { 
                await sendMessage(chatId, MESSAGES.feature_wip);
            } else if (callbackData === 'cb_inventory_sync') { 
                await handleInventorySyncSetup(chatId);
            } else if (callbackData === 'cb_update_phone') { 
                await handleUpdatePhoneNumberCallback(chatId);
            } else if (callbackData.startsWith('cb_select_gender_')) { 
                await handleGenderSelectionCallback(chatId, callbackData);
            } else if (callbackData === 'cb_add_passenger') { 
                await handleAddPassengerCallback(chatId);
            } else if (callbackData === 'cb_book_finish') { 
                const state = await getAppState(chatId);
                if (state.state === 'AWAITING_BOOKING_ACTION') {
                    await createPaymentOrder(chatId, state.data);
                } else {
                    await sendMessage(chatId, "❌ You don't have an active booking to finish.");
                }
            } else if (callbackData === 'cb_help' || callbackData === 'cb_status') {
                await sendHelpMessage(chatId);
            } else if (callbackData === 'cb_booking_couple' || callbackData === 'cb_booking_family') {
                await sendMessage(chatId, MESSAGES.feature_wip);
            }
        }
    } catch (error) {
        console.error("Error in main handler:", error.message);
        // Fallback error handler if something catastrophic happens in the flow
        const chatId = update.message?.chat.id || update.callback_query?.message.chat.id;
        if (chatId) {
            await sendMessage(chatId, "❌ A critical application error occurred. Please try /start again.");
        }
    }

    res.status(200).send('OK');
});

// --- NEW RAZORPAY WEBHOOK ENDPOINT ---
app.post('/api/razorpay/webhook', async (req, res) => {
    const signature = req.headers['x-razorpay-signature'];
    const payload = req.rawBody; 

    // Ensure DB is initialized for webhook processing
    try { getFirebaseDb(); } catch (e) {
        console.error("CRITICAL FIREBASE INITIALIZATION FAILED during Razorpay webhook.", e.message);
        return res.status(500).send('DB Init Error');
    }

    res.status(200).send('OK');

    if (RAZORPAY_WEBHOOK_SECRET && !verifyRazorpaySignature(payload, signature)) {
        console.error("WEBHOOK ERROR: Signature verification failed. Ignoring update.");
        return; 
    }

    const event = req.body.event;
    
    if (event === 'payment.failed' || event === 'order.paid') {
        const orderId = req.body.payload.order.entity.id;
        const db = getFirebaseDb();
        
        const sessionDoc = await db.collection('payment_sessions').doc(orderId).get();

        if (sessionDoc.exists) {
            const bookingData = sessionDoc.data().booking;
            
            if (event === 'order.paid') {
                await commitFinalBookingBatch(bookingData.chat_id, bookingData); 
            } else if (event === 'payment.failed') {
                await unlockSeats(bookingData);
                await db.collection('payment_sessions').doc(orderId).delete();
                await sendMessage(bookingData.chat_id, MESSAGES.payment_failed);
            }
        }
    }
});

// Add a simple health check endpoint
app.get('/', (req, res) => {
    res.status(200).json({ 
        status: 'OK', 
        message: 'GoRoute Telegram Bot is running',
        timestamp: new Date().toISOString()
    });
});

// Start the server
module.exports = app;
// Export cron function so Vercel can run it
module.exports.sendLiveLocationUpdates = sendLiveLocationUpdates;
