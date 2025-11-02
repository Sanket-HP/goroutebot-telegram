// Import the libraries we installed
const express = require('express');
const axios = require('axios');
const admin = require('firebase-admin');
const Razorpay = require('razorpay'); 
const crypto = require('crypto');

// --- Configuration ---
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN; 
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/`; 
const RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET;

// --- Predefined City List (For Search Feature) ---
const MAJOR_CITIES = [
    'Mumbai', 'Pune', 'Nagpur', 'Nashik', 'Aurangabad', 'Kolhapur', // Maharashtra
    'Panaji', 'Margao', // Goa
    'Bengaluru', // Karnataka
    'Hyderabad' // Telangana
].sort();

// --- Razorpay Initialization ---
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// --- MESSAGES (Updated to use HTML tags for robustness) ---
const MESSAGES = {
    help: `🆘 <b>GoRoute Help Center</b>

Select an option from the menu below to get started. You can also type commands like "book bus".`,
    no_buses: "❌ <b>No buses available matching your criteria.</b>\n\nPlease check back later or try different routes.",
    specify_bus_id: '❌ Please specify the Bus ID.\nExample: "Show seats BUS101"',
    seat_map_error: '❌ Error generating seat map for {busID}.',
    no_seats_found: '❌ No seats found in the system for bus {busID}.',
    feature_wip: '🚧 This feature is coming soon!',
    welcome_back: '👋 Welcome back, {name}!',
    
    // Registration
    prompt_role: "🎉 <b>Welcome to GoRoute!</b> To get started, please choose your role:",
    registration_started: "✅ Great! Your role is set to <b>{role}</b>.\n\nTo complete your profile, please provide your details in this format:\n\n<pre>my profile details [Your Full Name] / [Your Aadhar Number] / [Your Phone Number]</pre>", 
    profile_updated: "✅ <b>Profile Updated!</b> Your details have been saved.",
    profile_update_error: "❌ <b>Error!</b> Please use the correct format:\n<pre>my profile details [Name] / [Aadhar Number] / [Phone Number]</pre>", 
    user_not_found: "❌ User not found. Please send /start to register.",

    // Phone Update
    update_phone_prompt: "📞 <b>Update Phone:</b> Please enter your new 10-digit phone number now.",
    phone_updated_success: "✅ Phone number updated successfully!",
    phone_invalid: "❌ Invalid phone number. Please enter a 10-digit number only.",

    // Booking
    booking_type_prompt: "👤 <b>Booking Seats:</b> Please select your booking type:",
    gender_prompt: "🚻 <b>Seat Safety:</b> Is the passenger booking seat {seatNo} a Male or Female?",
    safety_violation: "🚫 <b>Seat Safety Violation:</b> A male cannot book seat {seatNo} as it is next to a female-occupied seat. Please choose another seat.",
    details_prompt: "✍️ <b>Passenger Details:</b> Please enter the passenger's Name, Age, and Aadhar number in this format:\n<pre>[Name] / [Age] / [Aadhar Number]</pre>",
    booking_passenger_prompt: "✅ Details saved for seat {seatNo}.\n\n<b>What's next?</b>",
    
    // Payment
    payment_required: "💰 <b>Payment Required:</b> Total Amount: ₹{amount} INR.\n\n<b>Order ID: {orderId}</b>\n\n<a href='{paymentUrl}'>Click here to pay</a>\n\n<i>(Note: Your seat is held for 15 minutes. The ticket will be automatically sent upon successful payment.)</i>",
    payment_awaiting: "⏳ Your seat is still locked while we await payment confirmation from Razorpay (Order ID: {orderId}).\n\nSelect an option below once payment is complete or if you wish to cancel.",
    payment_failed: "❌ Payment verification failed. Your seats have been released. Please try booking again.",
    session_cleared: "🧹 <b>Previous booking session cleared.</b> Your locked seats have been released.",

    // Detailed Ticket Confirmation
    payment_confirmed_ticket: `✅ <b>Payment Confirmed & E-Ticket Issued!</b>
    
🎫 <b>E-Ticket Details</b>
Bus: {busName} ({busType})
Route: {from} → {to}
Date: {journeyDate}
Departure: {departTime}
Seats: {seatList}
Boarding Points: {boardingPoints}

👤 <b>Passenger Info (Primary)</b>
Name: {name}
Phone: {phone}

💰 <b>Transaction Details</b>
Order ID: {orderId}
Amount Paid: ₹{amount} INR
Time: {dateTime}
`,

    booking_details_error: "❌ <b>Error!</b> Please provide details in the format: <pre>[Name] / [Age] / [Aadhar Number]</pre>",
    seat_not_available: "❌ Seat {seatNo} on bus {busID} is already booked or invalid.",
    no_bookings: "📭 You don't have any active bookings.",
    booking_cancelled: "🗑️ <b>Booking Cancelled</b>\n\nBooking {bookingId} has been cancelled successfully.\n\nYour refund will be processed and credited within 6 hours of <i>{dateTime}</i>.", 
    
    // NEW SEARCH MESSAGES
    search_from: "🗺️ <b>Travel From:</b> Select a city below, or <b>type the full name of your city</b> to search:",
    search_to: "➡️ <b>Travel To:</b> Select a city below, or <b>type the full name of your city</b> to search:",
    search_city_invalid: "❌ City not found. Please ensure you type the full city name correctly (e.g., 'Pune'). Try again:",
    search_date: "📅 <b>Travel Date:</b> When do you plan to travel?",
    search_results: "🚌 <b>Search Results ({from} to {to}, {date})</b> 🚌\n\n",
    
    // NEW MANIFEST MESSAGE
    manifest_header: "📋 <b>Bus Manifest - {busID}</b>\nRoute: {from} → {to}\nDate: {date}\nTotal Booked Seats: {count}\n\n",
    manifest_entry: " • <b>Seat {seat}:</b> {name} (Aadhar {aadhar}) {gender}",
    no_manifest: "❌ No confirmed bookings found for bus {busID}.",

    // Manager
    manager_add_bus_init: "📝 <b>Bus Creation:</b> Enter the <b>Bus Number</b> (e.g., <pre>MH-12 AB 1234</pre>):",
    manager_add_bus_number: "🚌 Enter the <b>Bus Name</b> (e.g., <pre>Sharma Travels</pre>):",
    manager_add_bus_route: "📍 Enter the Route (e.g., <pre>Delhi to Jaipur</pre>):",
    manager_add_bus_price: "💰 Enter the Base Price (e.g., <pre>850</pre>):",
    manager_add_bus_type: "🛋️ Enter the <b>Bus Seating Layout</b> (e.g., <pre>Seater</pre>, <pre>Sleeper</pre>, or <pre>Both</pre>):",
    manager_add_seat_type: "🪑 Enter the seat type for <b>Row {row}</b> (e.g., <pre>Sleeper Upper</pre>, <pre>Sleeper Lower</pre>, or <pre>Seater</pre>):",
    manager_add_bus_depart_date: "📅 Enter the Departure Date (YYYY-MM-DD, e.g., <pre>2025-12-25</pre>):",
    manager_add_bus_depart_time: "🕒 Enter the Departure Time (HH:MM, 24h format, e.g., <pre>08:30</pre>):",
    manager_add_bus_arrive_time: "🕡 Enter the Estimated Arrival Time (HH:MM, 24h format, e.g., <pre>18:00</pre>):",
    manager_add_bus_manager_phone: "📞 <b>Final Step:</b> Enter your Phone Number to associate with the bus:",
    manager_add_bus_boarding_init: "📍 <b>Boarding Points:</b> Enter the points and times in the format:\n<pre>[Point Name] / [HH:MM]</pre>\n\nSend 'DONE' when finished (max 5 points):",
    manager_add_bus_boarding_more: "✅ Point added. Add another (or send 'DONE'):",
    manager_add_bus_boarding_invalid: "❌ Invalid format. Please use: <pre>[Point Name] / [HH:MM]</pre>",
    manager_bus_saved: "✅ <b>Bus {busID} created!</b> Route: {route}. Next, add seats: \n\n<b>Next Step:</b> Now, create all seats for this bus by typing:\n<pre>add seats {busID} 40</pre>",
    manager_seats_saved: "✅ <b>Seats Added!</b> 40 seats have been created for bus {busID} and marked available. You can now use <pre>show seats {busID}</pre>.",
    manager_seats_invalid: "❌ Invalid format. Please use: <pre>add seats [BUSID] [COUNT]</pre>",
    manager_invalid_layout: "❌ Invalid layout. Please enter <pre>Seater</pre>, <pre>Sleeper</pre>, or <pre>Both</pre>.",
    manager_invalid_seat_type: "❌ Invalid seat type. Please enter <pre>Sleeper Upper</pre>, <pre>Sleeper Lower</pre>, or <pre>Seater</pre>.",

    // Tracking
    tracking_manager_prompt: "📍 <b>Live Tracking Setup:</b> Enter the Bus ID you wish to track/update (e.g., <pre>BUS101</pre>).",
    tracking_manager_enabled: "✅ <b>Tracking Enabled for {busID}</b>.\n\nTo update the location every 15 minutes, the manager must:\n1. Keep their <i>mobile location enabled</i>.\n2. The external Cron Job must be running.",
    tracking_not_found: "❌ Bus {busID} not found or tracking is not active.",
    tracking_passenger_info: "🚍 <b>Live Tracking - {busID}</b>\n\n📍 <b>Last Location:</b> {location}\n🕒 <b>Last Updated:</b> {time}\n\n<i>Note: Location updates every 15 minutes</i>",

    // Notifications
    manager_notification_booking: "🔔 <b>NEW BOOKING CONFIRMED!</b>\n\nBus: {busID}\nSeats: {seats}\nPassenger: {passengerName}\nTime: {dateTime}",
    manager_notification_cancellation: "⚠️ <b>BOOKING CANCELLED</b>\n\nBooking ID: {bookingId}\nBus: {busID}\nSeats: {seats}\nTime: {dateTime}",

    // General
    db_error: "❌ CRITICAL ERROR: The bot's database is not connected. Please contact support.",
    unknown_command: "🤔 I don't understand that command. Type <b>/help</b> for a list of available options.",
    sync_setup_init: "📝 <b>Inventory Sync Setup:</b> Enter the Bus ID you wish to synchronize (e.g., <pre>BUS101</pre>).",
    sync_setup_url: "🔗 Enter the <b>OSP API Endpoint</b> (the external URL for inventory data) for bus {busID}:",
    sync_success: "✅ <b>Inventory Sync Setup Successful!</b> Bus {busID} is now configured to pull data from {url}.",
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

/* --------------------- Telegram Axios Helpers (Updated to use HTML) ---------------------- */

// IMPORTANT: Using 'HTML' parse mode for better stability than 'Markdown'.
async function sendMessage(chatId, text, parseMode = 'HTML', replyMarkup = null) {
    if (!TELEGRAM_TOKEN) {
        console.error("❌ CRITICAL: TELEGRAM_TOKEN environment variable is missing. Cannot send message.");
        return; 
    }
    try {
        const payload = { chat_id: String(chatId), text: text, parse_mode: parseMode };
        if (replyMarkup) payload.reply_markup = replyMarkup;
        
        const response = await axios.post(`${TELEGRAM_API}sendMessage`, payload);
        // Console log only on success to make failed attempts clearer in logs
        console.log(`[TELEGRAM] Message sent successfully to ${chatId}.`);
    } catch (error) {
        if (error.response) {
            // Detailed logging for Telegram API failure
            console.error(`❌ TELEGRAM API ERROR (Status ${error.response.status}) for ${chatId}: ${error.response.data.description || JSON.stringify(error.response.data)}`);
            if (error.response.data.error_code === 401) {
                console.error("--- FATAL: 401 Unauthorized. CHECK TELEGRAM_TOKEN environment variable in Vercel. ---");
            }
            if (error.response.data.error_code === 400 && error.response.data.description.includes('Can\'t parse message')) {
                 console.error("--- HINT: 400 Parse Error. Check your HTML formatting in the message text. ---");
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
        await axios.post(`${TELEGRAM_API}sendChatAction`, { chat_id: chatId, action: action });
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
        await axios.post(`${TELEGRAM_API}answerCallbackQuery`, { callback_query_id: callbackQueryId });
    } catch (error) {
        // Suppress minor errors
    }
}

async function editMessageReplyMarkup(chatId, messageId, replyMarkup) {
    try {
        await axios.post(`${TELEGRAM_API}editMessageReplyMarkup`, {
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
        if (booking && booking.seats && Array.isArray(booking.seats)) {
             booking.seats.forEach(seat => {
                const seatRef = db.collection('seats').doc(`${booking.busID}-${seat.seatNo}`);
                batch.set(seatRef, { status: 'available', temp_chat_id: admin.firestore.FieldValue.delete(), gender: admin.firestore.FieldValue.delete() }, { merge: true });
            });
        }
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
        
        if (!busDoc.exists || !busDoc.data().manager_chat_id) return; 

        const managerChatId = busDoc.data().manager_chat_id;
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
            await sendMessage(managerChatId, notificationText, "HTML");
        }
    } catch (e) {
        console.error("Error sending manager notification:", e.message);
    }
}

/* --------------------- Live Tracking Cron Logic ---------------------- */

async function sendLiveLocationUpdates() {
    const db = getFirebaseDb();
    const updates = [];
    let updatesSent = 0;

    try {
        const busesSnapshot = await db.collection('buses').where('manager_chat_id', '!=', null).get();

        const currentTime = new Date();
        const notificationTime = currentTime.toLocaleTimeString('en-IN');
        const mockLocation = ["New Delhi Station", "Mumbai Central", "Pune Junction", "Jaipur Highway", "Bus is en route"];
        
        busesSnapshot.forEach(busDoc => {
            const data = busDoc.data();
            const busID = data.bus_id;
            const managerId = data.manager_chat_id;
            
            const randomLocation = mockLocation[Math.floor(Math.random() * mockLocation.length)];

            busDoc.ref.update({
                last_location_time: admin.firestore.FieldValue.serverTimestamp(),
                last_location_name: randomLocation
            });

            const managerNotification = MESSAGES.tracking_passenger_info
                .replace('{busID}', busID)
                .replace('{location}', randomLocation)
                .replace('{time}', notificationTime);
            
            updates.push(sendMessage(managerId, `🔔 [CRON UPDATE] ${managerNotification}`, "HTML"));
            updatesSent++;
        });

        await Promise.all(updates);
        return { updatesSent };

    } catch (error) {
        console.error("CRON JOB FAILED during update loop:", error.message);
        throw error;
    }
}

/* --------------------- Razorpay Webhook Verification ---------------------- */

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
                [{ text: "📋 Show Manifest", callback_data: "cb_show_manifest_prompt" }],
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
        
        finalButtons.push([{ text: "📞 Update Phone", callback_data: "cb_update_phone" }, { text: "👤 My Profile", callback_data: "cb_my_profile" }]);
        finalButtons.push([{ text: "ℹ️ Help / Status", callback_data: "cb_status" }]);

        const keyboard = { inline_keyboard: finalButtons };

        await sendMessage(chatId, MESSAGES.help, "HTML", keyboard);
    } catch (e) {
        console.error("❌ sendHelpMessage failed:", e.message);
        await sendMessage(chatId, "❌ Database error when loading help menu. Please try /start again.");
    }
}

/* --------------------- General Handlers ---------------------- */

async function handleStartSearch(chatId) {
    try {
        // Use a subset of major cities for initial button suggestions
        const suggestedCities = MAJOR_CITIES.slice(0, 6); 
        
        const keyboard = {
            inline_keyboard: suggestedCities.map(loc => [{ text: loc, callback_data: `cb_search_from_${loc}` }])
        };

        await saveAppState(chatId, 'AWAITING_SEARCH_FROM', { step: 1, available_cities: MAJOR_CITIES });
        await sendMessage(chatId, MESSAGES.search_from, "HTML", keyboard);

    } catch (e) {
        console.error('Error starting search:', e.message);
        await sendMessage(chatId, MESSAGES.db_error);
    }
}

async function handleSearchInputCallback(chatId, callbackData, state) {
    const db = getFirebaseDb();
    let data = state.data;
    let nextState = '';
    let response = '';
    let keyboard = null;

    // Handle initial Source selection (step 1)
    if (state.state === 'AWAITING_SEARCH_FROM') {
        data.from = callbackData.replace('cb_search_from_', '');
        
        const snapshot = await db.collection('buses').where('from', '==', data.from).get();
        const availableDestinations = new Set();
        snapshot.forEach(doc => availableDestinations.add(doc.data().to));

        const dests = Array.from(availableDestinations).sort();
        const suggestedDests = dests.slice(0, 6); // Suggest up to 6 destinations

        keyboard = {
            inline_keyboard: suggestedDests.map(loc => [{ text: loc, callback_data: `cb_search_to_${loc}` }])
        };

        if (dests.length === 0) {
             await saveAppState(chatId, 'IDLE', {});
             return await sendMessage(chatId, `❌ No destinations available from <b>${data.from}</b>.`, "HTML");
        }
        
        data.available_cities = dests; // Update city list for the next step (text search)
        nextState = 'AWAITING_SEARCH_TO';
        response = MESSAGES.search_to;
        
    // Handle Destination selection (step 2)
    } else if (state.state === 'AWAITING_SEARCH_TO') {
        data.to = callbackData.replace('cb_search_to_', '');

        keyboard = {
            inline_keyboard: [
                [{ text: "📅 Today", callback_data: `cb_search_date_today` }],
                [{ text: "➡️ Tomorrow", callback_data: `cb_search_date_tomorrow` }],
                [{ text: "🗓️ Pick Specific Date (WIP)", callback_data: `cb_search_date_specific` }],
            ]
        };
        nextState = 'AWAITING_SEARCH_DATE';
        response = MESSAGES.search_date;

    // Handle Date selection (step 3)
    } else if (state.state === 'AWAITING_SEARCH_DATE') {
        data.dateType = callbackData.replace('cb_search_date_', '');
        let targetDate;

        if (data.dateType === 'today') {
            targetDate = new Date().toISOString().split('T')[0];
        } else if (data.dateType === 'tomorrow') {
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            targetDate = tomorrow.toISOString().split('T')[0];
        } else {
            await saveAppState(chatId, 'IDLE', {});
            return await sendMessage(chatId, MESSAGES.feature_wip + " Please restart search and select Today or Tomorrow.");
        }
        
        data.date = targetDate;
        await saveAppState(chatId, 'IDLE', {}); 
        
        return await showSearchResults(chatId, data.from, data.to, data.date);
    }

    await saveAppState(chatId, nextState, data);
    await sendMessage(chatId, response, "HTML", keyboard);
}

async function handleSearchTextInput(chatId, text, state) {
    const cityName = text.trim();
    const cityList = state.data.available_cities || MAJOR_CITIES;
    
    // Check if the input city is a valid major city
    if (!cityList.includes(cityName)) {
        return await sendMessage(chatId, MESSAGES.search_city_invalid, "HTML");
    }

    if (state.state === 'AWAITING_SEARCH_FROM') {
        // If valid city, jump to Destination selection
        state.data.from = cityName;
        
        const db = getFirebaseDb();
        const snapshot = await db.collection('buses').where('from', '==', cityName).get();
        const availableDestinations = new Set();
        snapshot.forEach(doc => availableDestinations.add(doc.data().to));

        const dests = Array.from(availableDestinations).sort();
        const suggestedDests = dests.slice(0, 6);

        const keyboard = {
            inline_keyboard: suggestedDests.map(loc => [{ text: loc, callback_data: `cb_search_to_${loc}` }])
        };

        if (dests.length === 0) {
             await saveAppState(chatId, 'IDLE', {});
             return await sendMessage(chatId, `❌ No destinations available from <b>${cityName}</b>.`, "HTML");
        }
        
        state.data.available_cities = dests; 
        await saveAppState(chatId, 'AWAITING_SEARCH_TO', state.data);
        await sendMessage(chatId, MESSAGES.search_to, "HTML", keyboard);

    } else if (state.state === 'AWAITING_SEARCH_TO') {
        // If valid city, jump to Date selection
        state.data.to = cityName;

        const keyboard = {
            inline_keyboard: [
                [{ text: "📅 Today", callback_data: `cb_search_date_today` }],
                [{ text: "➡️ Tomorrow", callback_data: `cb_search_date_tomorrow` }],
                [{ text: "🗓️ Pick Specific Date (WIP)", callback_data: `cb_search_date_specific` }],
            ]
        };
        await saveAppState(chatId, 'AWAITING_SEARCH_DATE', state.data);
        await sendMessage(chatId, MESSAGES.search_date, "HTML", keyboard);
    }
}


async function showSearchResults(chatId, from, to, date) {
    try {
        const db = getFirebaseDb();
        
        const snapshot = await db.collection('buses')
            .where('from', '==', from)
            .where('to', '==', to)
            .get(); 

        const buses = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            if (data.departure_time.startsWith(date)) {
                 buses.push({
                    busID: data.bus_id, from: data.from, to: data.to,
                    date: data.departure_time.split(' ')[0], time: data.departure_time.split(' ')[1],
                    owner: data.owner, price: data.price, busType: data.bus_type,
                    rating: data.rating || 4.2, total_seats: data.total_seats || 40 
                });
            }
        });

        if (buses.length === 0) return await sendMessage(chatId, MESSAGES.no_buses, "HTML");

        let response = MESSAGES.search_results.replace('{from}', from).replace('{to}', to).replace('{date}', date);
        
        for (const bus of buses) {
            const seatsSnapshot = await db.collection('seats').where('bus_id', '==', bus.busID).where('status', '==', 'available').get();
            const availableSeats = seatsSnapshot.size;

            response += `<b>${bus.busID}</b> - ${bus.owner}\n`;
            response += `🕒 ${bus.time}\n`;
            response += `💰 ₹${bus.price} • ${bus.busType} • ⭐ ${bus.rating}\n`;
            response += `💺 ${availableSeats} seats available\n`;
            response += `📋 "Show seats ${bus.busID}" to view seats\n\n`;
        }
        await sendMessage(chatId, response, "HTML");
        
    } catch (error) {
        console.error('❌ Bus search results error:', error.message);
        await sendMessage(chatId, MESSAGES.db_error);
    }
}

async function handleShowManifest(chatId, text) {
    const match = text.match(/show manifest\s+(BUS\d+)/i);
    if (!match) return await sendMessage(chatId, "❌ Please specify Bus ID.\nExample: <pre>Show manifest BUS101</pre>", "HTML");

    const busID = match[1].toUpperCase();

    const userRole = await getUserRole(chatId);
    if (userRole !== 'manager' && userRole !== 'owner') {
        return await sendMessage(chatId, "❌ You do not have permission to view the manifest.");
    }
    
    try {
        const db = getFirebaseDb();
        const busDoc = await db.collection('buses').doc(busID).get();
        
        if (!busDoc.exists) return await sendMessage(chatId, `❌ Bus ID <b>${busID}</b> not found.`, "HTML");
        const busData = busDoc.data();

        const snapshot = await db.collection('bookings')
            .where('bus_id', '==', busID)
            .where('status', '==', 'confirmed')
            .get();
            
        if (snapshot.empty) return await sendMessage(chatId, MESSAGES.no_manifest.replace('{busID}', busID), "HTML");
        
        let manifestText = MESSAGES.manifest_header
            .replace('{busID}', busID)
            .replace('{from}', busData.from)
            .replace('{to}', busData.to)
            .replace('{date}', busData.departure_time.split(' ')[0])
            .replace('{count}', snapshot.docs.reduce((sum, doc) => sum + doc.data().total_seats, 0));

        snapshot.forEach(doc => {
            const booking = doc.data();
            booking.passengers.forEach(p => {
                manifestText += MESSAGES.manifest_entry
                    .replace('{seat}', p.seat)
                    .replace('{name}', p.name)
                    .replace('{aadhar}', p.aadhar)
                    .replace('{gender}', `(${p.gender})`) + "\n";
            });
        });

        await sendMessage(chatId, manifestText, "HTML");

    } catch (e) {
        console.error('❌ Manifest Generation Error:', e.message);
        await sendMessage(chatId, MESSAGES.db_error);
    }
}

async function handleUpdatePhoneNumberCallback(chatId) {
    const userRole = await getUserRole(chatId);
    if (userRole === 'unregistered' || userRole === 'error') {
        return await sendMessage(chatId, "❌ You must register first to update your profile. Send /start.");
    }
    
    try {
        await saveAppState(chatId, 'AWAITING_NEW_PHONE', {});
        await sendMessage(chatId, MESSAGES.update_phone_prompt, "HTML");
    } catch (e) {
        await sendMessage(chatId, MESSAGES.db_error + " Could not initiate phone update.");
    }
}

async function handlePhoneUpdateInput(chatId, text) {
    const phoneRegex = /^\d{10}$/;
    const phoneNumber = text.replace(/[^0-9]/g, '');

    if (!phoneNumber.match(phoneRegex)) {
        return await sendMessage(chatId, MESSAGES.phone_invalid, "HTML");
    }
    
    try {
        const db = getFirebaseDb();
        await db.collection('users').doc(String(chatId)).update({ phone: phoneNumber });
        
        await saveAppState(chatId, 'IDLE', {});
        await sendMessage(chatId, MESSAGES.phone_updated_success, "HTML");
        await handleUserProfile(chatId);
        
    } catch (error) {
        console.error('❌ Phone Update Error:', error.message);
        await sendMessage(chatId, MESSAGES.db_error + " Could not save phone number.");
    }
}

async function handleBusSearch(chatId) {
    await handleStartSearch(chatId);
}

async function handleCancellation(chatId, text) {
    const match = text.match(/cancel booking\s+(BOOK\d+)/i);
    if (!match) return await sendMessage(chatId, "❌ Please specify Booking ID.\nExample: <pre>Cancel booking BOOK123</pre>", "HTML");

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
            batch.set(seatRef, { status: 'available', booking_id: admin.firestore.FieldValue.delete(), temp_chat_id: admin.firestore.FieldValue.delete(), gender: admin.firestore.FieldValue.delete() }, { merge: true });
        });

        await batch.commit();
        
        await sendMessage(chatId, MESSAGES.booking_cancelled.replace('{bookingId}', bookingId).replace('{dateTime}', refundTime), "HTML");
        
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
        const db = getFirebaseDb();
        const doc = await db.collection('users').doc(String(chatId)).get();

        if (doc.exists) {
           const userName = user.first_name || 'User'; 
           await sendMessage(chatId, MESSAGES.welcome_back.replace('{name}', userName));
           await sendHelpMessage(chatId); 
        } else {
            const keyboard = {
                inline_keyboard: [
                    [{ text: "👤 User (Book Tickets)", callback_data: "cb_register_role_user" }],
                    [{ text: "👨‍💼 Bus Manager (Manage Buses)", callback_data: "cb_register_role_manager" }],
                    [{ text: "👑 Bus Owner (Manage Staff)", callback_data: "cb_register_role_owner" }],
                ]
            };
            await sendMessage(chatId, MESSAGES.prompt_role, "HTML", keyboard);
        }
    } catch (error) {
        console.error(`❌ CRITICAL /start error for ${chatId}:`, error.message);
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
        await sendMessage(chatId, MESSAGES.registration_started.replace('{role}', role), "HTML");
    } catch (error) {
        console.error('❌ handleRoleSelection error:', error.message);
        await sendMessage(chatId, MESSAGES.db_error);
    }
}

async function handleProfileUpdate(chatId, text) {
    try {
        const match = text.match(/my profile details\s+([^\/]+)\s*\/\s*(\d+)\s*\/\s*(\d+)/i);
        
        if (!match) {
            await sendMessage(chatId, MESSAGES.profile_update_error, "HTML");
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
        await sendMessage(chatId, MESSAGES.profile_updated, "HTML");
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
            
            const profileText = `👤 <b>Your Profile</b>\n\n` +
                                `<b>Name:</b> ${user.name || 'Not set'}\n` +
                                `<b>Chat ID:</b> ${user.chat_id}\n` +
                                `<b>Phone:</b> ${user.phone || 'Not set'}\n` +
                                `<b>Aadhar:</b> ${user.aadhar || 'Not set'}\n` +
                                `<b>Role:</b> ${user.role || 'user'}\n` +
                                `<b>Status:</b> ${user.status || 'N/A'}\n` +
                                `<b>Member since:</b> ${joinDate}`;
            
            await sendMessage(chatId, profileText, "HTML");
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

        let response = "🎫 <b>Your Active Bookings</b>\n\n";
        snapshot.forEach(doc => {
            const b = doc.data();
            const seatsList = b.seats.join(', ');
            response += `📋 <b>ID: ${b.booking_id}</b>\n`;
            response += `🚌 Bus: ${b.bus_id}\n`;
            response += `💺 Seats: ${seatsList}\n`;
            response += `👥 Passengers: ${b.passengers.length}\n`;
            response += `Status: ${b.status}\n\n`;
        });
        response += `💡 To cancel, type "Cancel booking BOOKING_ID"`;
        await sendMessage(chatId, response, "HTML");
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
        
        if (!busID) return await sendMessage(chatId, MESSAGES.specify_bus_id, "HTML");

        const busInfo = await getBusInfo(busID);
        if (!busInfo) return await sendMessage(chatId, MESSAGES.seat_map_error.replace('{busID}', busID), "HTML");

        const db = getFirebaseDb();
        const seatsSnapshot = await db.collection('seats').where('bus_id', '==', busID).get();
        const seatStatus = {};
        let availableCount = 0;
        
        seatsSnapshot.forEach(doc => {
            const data = doc.data();
            seatStatus[data.seat_no] = data;
            if (data.status === 'available') availableCount++;
        });
        
        // --- Seat Map UI Generation ---
        let seatMap = `🚍 <b>Seat Map - ${busID}</b>\n`;
        seatMap += `📍 ${busInfo.from} → ${busInfo.to}\n`;
        seatMap += `📅 ${busInfo.date} 🕒 ${busInfo.time}\n\n`;
        // Updated Legend with Emojis
        seatMap += `Legend: ✅ Available • 🪑 Seater • 🛏️ Sleeper\n`;
        seatMap += `⚫ Booked • 🚺 Female • 🚹 Male\n\n`;
        seatMap += `<pre>--------------------------------------------------</pre>\n`;

        for (let row = 1; row <= 10; row++) {
            let line = '';
            for (let col of ['A', 'B', 'C', 'D']) {
                const seatNo = `${row}${col}`;
                const data = seatStatus[seatNo] || {}; 
                const status = data.status || '⬜'; 
                const seatType = data.type || 'seater'; 
                const gender = data.gender;
                
                let icon = seatType.includes('sleeper') ? '🛏️' : '🪑';
                let content = ``; 

                if (status === 'available') {
                    // Available: [SeatNo][Icon]✅
                    content = `${seatNo.padEnd(3)} ${icon} ✅`;
                } else if (status === 'booked' || status === 'locked') {
                    // Booked: [SeatNo][Icon][Gender]⚫
                    const genderIcon = gender === 'F' ? '🚺' : '🚹';
                    content = `${seatNo.padEnd(3)} ${icon}${genderIcon}⚫`; 
                } else {
                    // Unconfigured: [SeatNo]⬜
                    content = `${seatNo.padEnd(3)} ⬜`; 
                }
                
                // Use a fixed width string plus one space for separation
                line += `${content.padEnd(10)}`; 
                if (col === 'B') {
                    line += `  🚌  `; // Aisle spacer
                } 
            }
            seatMap += `<pre>${line.trim()}</pre>\n`; 
        }
        
        seatMap += `<pre>--------------------------------------------------</pre>\n`;
        seatMap += `\n📊 <b>${availableCount}</b> seats available / ${seatsSnapshot.size || 0}\n\n`;
        seatMap += `💡 <b>Book a seat:</b> "Book seat ${busID} 1A"`;

        await sendMessage(chatId, seatMap, "HTML");
        
    } catch (error) {
        console.error('❌ Seat map error:', error.message);
        await sendMessage(chatId, MESSAGES.db_error);
    }
}

async function handleSeatSelection(chatId, text) {
    try {
        const match = text.match(/book seat\s+(BUS\d+)\s+([A-Z0-9]+)/i);
        if (!match) return await sendMessage(chatId, "❌ Please specify Bus ID and Seat Number.\nExample: <pre>Book seat BUS101 3A</pre>", "HTML");

        const busID = match[1].toUpperCase();
        const seatNo = match[2].toUpperCase();

        const db = getFirebaseDb();
        
        const seatRef = db.collection('seats').doc(`${busID}-${seatNo}`);
        const seatDoc = await seatRef.get();

        if (!seatDoc.exists || seatDoc.data().status !== 'available') {
             return await sendMessage(chatId, MESSAGES.seat_not_available.replace('{seatNo}', seatNo).replace('{busID}', busID), "HTML");
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
        await sendMessage(chatId, MESSAGES.gender_prompt.replace('{seatNo}', seatNo), "HTML", keyboard);
        
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
                return await sendMessage(chatId, MESSAGES.safety_violation.replace('{seatNo}', seatNo), "HTML");
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

        await sendMessage(chatId, MESSAGES.details_prompt, "HTML");
        
    } catch (error) {
        console.error('❌ handleGenderSelectionCallback error:', error.message);
        await saveAppState(chatId, 'IDLE', {});
        await sendMessage(chatId, MESSAGES.db_error);
    }
}

async function handleBookingInput(chatId, text, state) {
    try {
        const booking = state.data;
        
        if (state.state === 'AWAITING_PASSENGER_DETAILS') {
            const passengerMatch = text.match(/([^\/]+)\s*\/\s*(\d+)\s*\/\s*(\d+)/i);
            if (!passengerMatch) return await sendMessage(chatId, MESSAGES.booking_details_error, "HTML");

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
            await sendMessage(chatId, MESSAGES.booking_passenger_prompt.replace('{count}', booking.passengers.length).replace('{seatNo}', booking.seatNo), "HTML", keyboard);
        }
    } catch (error) {
        console.error('❌ handleBookingInput error:', error.message);
        await sendMessage(chatId, MESSAGES.db_error);
    }
}

async function handleAddPassengerCallback(chatId) {
    try {
        const state = await getAppState(chatId);
        
        if (state.state !== 'AWAITING_BOOKING_ACTION') return await sendMessage(chatId, "❌ Please start a new booking first (Book seat BUS ID).");
        
        return await sendMessage(chatId, MESSAGES.feature_wip + " Multi-passenger booking requires selecting a new seat first.", "HTML");

    } catch (error) {
        console.error('❌ handleAddPassengerCallback error:', error.message);
        await sendMessage(chatId, MESSAGES.db_error);
    }
}

async function createPaymentOrder(chatId, booking) {
    try {
        const pricePerSeat = 45000; // Amount in paise/cents (e.g., ₹450.00)
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
        
        const keyboard = {
            inline_keyboard: [
                [{ text: "✅ I have Paid (Confirm)", callback_data: "cb_payment_confirm" }],
                [{ text: "❌ Cancel Booking", callback_data: "cb_payment_cancel" }]
            ]
        };

        await sendMessage(chatId, 
            MESSAGES.payment_required.replace('{amount}', (totalAmount / 100).toFixed(2)).replace('{paymentUrl}', paymentUrl).replace('{orderId}', order.id), 
            "HTML", keyboard); 

    } catch (error) {
        console.error('❌ Payment Order Creation Error:', error.message);
        await unlockSeats(booking);
        await sendMessage(chatId, MESSAGES.db_error + " Failed to create payment order. Seats were released.");
    }
}

async function handlePaymentCancelCallback(chatId) {
    try {
        const state = await getAppState(chatId);
        if (state.state !== 'AWAITING_PAYMENT') {
            return await sendMessage(chatId, "❌ No active payment session to cancel.");
        }
        const booking = state.data;
        
        // 1. Unlock seats
        await unlockSeats(booking);
        
        // 2. Clear state and session
        const db = getFirebaseDb();
        if (booking.razorpay_order_id) {
            await db.collection('payment_sessions').doc(booking.razorpay_order_id).delete();
        }
        await saveAppState(chatId, 'IDLE', {});

        // 3. Send confirmation
        const response = `🗑️ <b>Booking Session Cancelled</b>\n\nYour tentative seats for <b>Order ID:</b> ${booking.razorpay_order_id || 'N/A'} have been released. Please start a new booking with /book.`;
        await sendMessage(chatId, response, "HTML");
        
    } catch (e) {
        console.error('❌ handlePaymentCancelCallback error:', e.message);
        await sendMessage(chatId, MESSAGES.db_error + " Failed to cancel payment session.");
    }
}


async function commitFinalBookingBatch(chatId, booking) {
    const db = getFirebaseDb();
    const batch = db.batch();
    const dateTime = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

    // 1. Fetch User and Bus Details for the ticket
    const userDoc = await db.collection('users').doc(String(chatId)).get();
    const busDoc = await db.collection('buses').doc(booking.busID).get();

    const userData = userDoc.exists ? userDoc.data() : {};
    const busData = busDoc.exists ? busDoc.data() : {};
    
    // 2. Commit Booking Record
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

    // 3. Update Seat Statuses
    booking.seats.forEach(seat => {
        const seatRef = db.collection('seats').doc(`${booking.busID}-${seat.seatNo}`);
        batch.update(seatRef, { 
            status: 'booked', 
            booking_id: booking.bookingId, 
            temp_chat_id: admin.firestore.FieldValue.delete() 
        });
    });

    // 4. Clean up state and payment session
    batch.delete(db.collection('user_state').doc(String(chatId)));
    batch.delete(db.collection('payment_sessions').doc(booking.razorpay_order_id));
    
    await batch.commit();

    // 5. Send Manager Notification
    await sendManagerNotification(booking.busID, 'BOOKING', { 
        seats: booking.seats,
        passengerName: booking.passengers[0].name,
        dateTime: dateTime
    });
    
    // 6. Send Detailed Ticket Confirmation to User
    const seatList = booking.seats.map(s => s.seatNo).join(', ');
    const [journeyDate, departTime] = (busData.departure_time || 'N/A N/A').split(' ');

    const boardingPointsText = (busData.boarding_points && busData.boarding_points.length > 0)
        ? busData.boarding_points.map(p => `• ${p.name} (${p.time})`).join('\n')
        : 'N/A';

    const ticketMessage = MESSAGES.payment_confirmed_ticket
        .replace('{busName}', busData.bus_name || 'N/A')
        .replace('{busType}', busData.bus_type || 'N/A')
        .replace('{from}', busData.from || 'N/A')
        .replace('{to}', busData.to || 'N/A')
        .replace('{journeyDate}', journeyDate)
        .replace('{departTime}', departTime)
        .replace('{seatList}', seatList)
        .replace('{boardingPoints}', boardingPointsText)
        .replace('{name}', userData.name || 'N/A')
        .replace('{phone}', userData.phone || 'N/A')
        .replace('{orderId}', booking.razorpay_order_id)
        .replace('{amount}', (booking.total_amount / 100).toFixed(2)) // Convert paise to INR
        .replace('{dateTime}', dateTime);

    await sendMessage(chatId, ticketMessage, "HTML");
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
        await sendMessage(chatId, MESSAGES.manager_add_bus_init, "HTML");

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
                if (!data.busNumber) return await sendMessage(chatId, "❌ Invalid Bus Number. Try again:", "HTML");
                
                nextState = 'MANAGER_ADD_BUS_NAME';
                response = MESSAGES.manager_add_bus_number;
                break;
                
            case 'MANAGER_ADD_BUS_NAME':
                data.busName = text;
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
                if (isNaN(data.price)) return await sendMessage(chatId, "❌ Invalid price. Enter a number (e.g., 850):", "HTML");
                
                nextState = 'MANAGER_ADD_BUS_TYPE';
                response = MESSAGES.manager_add_bus_type;
                break;
                
            case 'MANAGER_ADD_BUS_TYPE':
                data.busLayout = text.toLowerCase().trim();
                if (!validLayouts.includes(data.busLayout)) return await sendMessage(chatId, MESSAGES.manager_invalid_layout, "HTML");

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

                if (!isValidSeatType) return await sendMessage(chatId, MESSAGES.manager_invalid_seat_type, "HTML");

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
                if (!text.match(dateRegex)) return await sendMessage(chatId, "❌ Invalid date format (YYYY-MM-DD). Try again:", "HTML");
                data.departDate = text;
                nextState = 'MANAGER_ADD_BUS_DEPART_TIME';
                response = MESSAGES.manager_add_bus_depart_time;
                break;
                
            case 'MANAGER_ADD_BUS_DEPART_TIME':
                if (!text.match(timeRegex)) return await sendMessage(chatId, "❌ Invalid time format (HH:MM). Try again:", "HTML");
                data.departTime = text;
                nextState = 'MANAGER_ADD_BUS_ARRIVE_TIME';
                response = MESSAGES.manager_add_bus_arrive_time;
                break;

            case 'MANAGER_ADD_BUS_ARRIVE_TIME':
                if (!text.match(timeRegex)) return await sendMessage(chatId, "❌ Invalid time format (HH:MM). Try again:", "HTML");
                data.arriveTime = text;
                nextState = 'MANAGER_ADD_BUS_MANAGER_PHONE';
                response = MESSAGES.manager_add_bus_manager_phone;
                break;

            case 'MANAGER_ADD_BUS_MANAGER_PHONE':
                data.managerPhone = text.replace(/[^0-9]/g, '');
                if (!data.managerPhone.match(phoneRegex)) return await sendMessage(chatId, "❌ Invalid Phone Number. Enter a 10-digit number:", "HTML");

                const uniqueBusId = `BUS${Date.now().toString().slice(-6)}`;
                data.uniqueBusId = uniqueBusId;
                data.boardingPoints = [];
                
                nextState = 'MANAGER_ADD_BUS_BOARDING_POINTS_INIT';
                response = MESSAGES.manager_add_bus_boarding_init;
                await saveAppState(chatId, nextState, data);
                await sendMessage(chatId, response, "HTML");
                return; 

            case 'MANAGER_ADD_BUS_BOARDING_POINTS_INIT':
            case 'MANAGER_ADD_BUS_BOARDING_POINTS_INPUT': 
                const pointMatch = text.match(/^([^\/]+)\s*\/\s*(\d{2}:\d{2})$/i);

                if (text.toUpperCase() === 'DONE' || data.boardingPoints.length >= 5) {
                    
                    if (data.boardingPoints.length === 0) {
                        await sendMessage(chatId, "⚠️ No boarding points added. Proceeding without them.");
                    } else if (data.boardingPoints.length >= 5 && text.toUpperCase() !== 'DONE') {
                         await sendMessage(chatId, "⚠️ Max 5 boarding points reached. Proceeding to save.");
                    }
                    
                    // --- FINAL BUS COMMIT ---
                    const userDoc = await db.collection('users').doc(String(chatId)).get();
                    const ownerName = userDoc.exists ? userDoc.data().name : 'System Owner';
                    
                    if (userDoc.exists) {
                        await db.collection('users').doc(String(chatId)).update({ phone: data.managerPhone });
                    }
                    
                    const routeParts = data.route.split(' to ').map(s => s.trim());
                    const from = routeParts[0] || 'Unknown';
                    const to = routeParts.length > 1 ? routeParts[1] : 'Unknown';
                    
                    await db.collection('buses').doc(data.uniqueBusId).set({
                        bus_id: data.uniqueBusId,
                        bus_number: data.busNumber,
                        bus_name: data.busName,
                        owner: ownerName,
                        from: from,
                        to: to,
                        departure_time: `${data.departDate} ${data.departTime}`, 
                        arrival_time: data.arriveTime,
                        manager_chat_id: String(chatId), 
                        manager_phone: data.managerPhone,
                        price: data.price,
                        bus_type: data.busLayout,
                        seat_configuration: data.seatsToConfigure,
                        boarding_points: data.boardingPoints, 
                        total_seats: 40,
                        rating: 5.0,
                        status: 'scheduled'
                    });
                    
                    await db.collection('user_state').doc(String(chatId)).delete(); 

                    response = MESSAGES.manager_bus_saved
                        .replace('{busID}', data.uniqueBusId)
                        .replace('{route}', data.route);
                    await sendMessage(chatId, response, "HTML");
                    return;

                } else if (pointMatch) {
                    const pointName = pointMatch[1].trim();
                    const time = pointMatch[2].trim();
                    data.boardingPoints.push({ name: pointName, time: time });
                    nextState = 'MANAGER_ADD_BUS_BOARDING_POINTS_INPUT';
                    response = MESSAGES.manager_add_bus_boarding_more;

                } else {
                    nextState = state.state;
                    response = MESSAGES.manager_add_bus_boarding_invalid;
                }
                break;
        }

        await saveAppState(chatId, nextState, data);
        await sendMessage(chatId, response, "HTML");

    } catch (error) {
        console.error('❌ Manager Input Flow Error:', error.message);
        await db.collection('user_state').doc(String(chatId)).delete();
        await sendMessage(chatId, MESSAGES.db_error + " Bus creation failed. Please try again.");
    }
}

async function handleAddSeatsCommand(chatId, text) {
    const match = text.match(/add seats\s+(BUS\d+)\s+(\d+)/i);
    if (!match) return await sendMessage(chatId, MESSAGES.manager_seats_invalid, "HTML");

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
        
        const busData = busDoc.data();
        const config = busData.seat_configuration || [];
        if (config.length === 0) return await sendMessage(chatId, `❌ Bus ${busID} configuration missing. Please complete the bus creation flow.`);
        
        await busDoc.ref.update({ total_seats: count }); // Update total seats count

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
                    row: rowIndex,
                    col: col,
                });
                seatsAdded++;
            }
        }
        
        await batch.commit();
        await sendMessage(chatId, MESSAGES.manager_seats_saved.replace('{busID}', busID), "HTML");

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
    await sendMessage(chatId, MESSAGES.sync_setup_init, "HTML");
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
                await sendMessage(chatId, response, "HTML");
                return;
        }

        await saveAppState(chatId, nextState, data);
        await sendMessage(chatId, response, "HTML");

    } catch (error) {
        console.error('❌ Inventory Sync Flow Error:', error.message);
        await db.collection('user_state').doc(String(chatId)).delete(); 
        await sendMessage(chatId, MESSAGES.db_error + " Inventory sync setup failed. Please try again.");
    }
}

/* --------------------- Message Router ---------------------- */

async function handleUserMessage(chatId, text, user) {
    const textLower = text.toLowerCase().trim();
    let state;
    
    // --- GLOBAL COMMANDS (Check first to allow flow breaking/reset) ---
    if (textLower === '/start' || textLower === '/help' || textLower === 'help') {
        try {
            state = await getAppState(chatId);
            // If stuck in payment, perform cleanup
            if (state.state === 'AWAITING_PAYMENT' && state.data.busID) {
                await unlockSeats(state.data);
                const db = getFirebaseDb();
                if (state.data.razorpay_order_id) {
                    await db.collection('payment_sessions').doc(state.data.razorpay_order_id).delete();
                }
                await saveAppState(chatId, 'IDLE', {});
                await sendMessage(chatId, MESSAGES.session_cleared, "HTML");
            } else if (state.state !== 'IDLE') {
                // Clear other non-critical pending states to allow starting over
                await saveAppState(chatId, 'IDLE', {});
            }
        } catch (e) {
            console.error('Error during global command cleanup:', e.message);
        }
        
        // After cleanup, execute the command
        if (textLower === '/start') {
            await startUserRegistration(chatId, user);
        } else {
            await sendHelpMessage(chatId);
        }
        return;
    }


    // --- STATE MANAGEMENT CHECK (Handles sequential input/button click messages) ---
    try {
        state = await getAppState(chatId);
    } catch (e) {
        await sendMessage(chatId, MESSAGES.db_error + " (State check failed)");
        return;
    }

    if (state.state !== 'IDLE') {
        if (state.state === 'AWAITING_SEARCH_FROM' || state.state === 'AWAITING_SEARCH_TO') {
             // NEW: Handle text input for searching cities
             await handleSearchTextInput(chatId, text, state);
        } else if (state.state.startsWith('AWAITING_PASSENGER') || state.state.startsWith('AWAITING_GENDER')) {
            await handleBookingInput(chatId, text, state);
        } else if (state.state.startsWith('MANAGER_ADD_BUS') || state.state.startsWith('MANAGER_ADD_SEAT')) {
            await handleManagerInput(chatId, text, state);
        } else if (state.state.startsWith('MANAGER_LIVE_TRACKING')) { 
            await sendMessage(chatId, MESSAGES.feature_wip);
        } else if (state.state === 'AWAITING_NEW_PHONE') { 
            await handlePhoneUpdateInput(chatId, text);
        } else if (state.state.startsWith('MANAGER_SYNC_SETUP')) {
            await handleInventorySyncInput(chatId, text, state);
        } else if (state.state === 'AWAITING_PAYMENT') {
            // User sent a message while waiting for payment, re-send the payment prompt with buttons
            const keyboard = {
                inline_keyboard: [
                    [{ text: "✅ I have Paid (Confirm)", callback_data: "cb_payment_confirm" }],
                    [{ text: "❌ Cancel Booking", callback_data: "cb_payment_cancel" }]
                ]
            };
            
            await sendMessage(chatId, MESSAGES.payment_awaiting.replace('{orderId}', state.data.razorpay_order_id), "HTML", keyboard);
        }
        return;
    }

    // --- STANDARD COMMANDS (IDLE state) ---
    if (textLower.startsWith('my profile details')) {
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
    else if (textLower.startsWith('show manifest')) {
        await handleShowManifest(chatId, text);
    }
    else if (textLower.startsWith('live tracking')) { 
        await sendMessage(chatId, MESSAGES.feature_wip);
    }
    else { 
        await sendMessage(chatId, MESSAGES.unknown_command, "HTML");
    }
}

/* --------------------- Main Webhook Handler ---------------------- */

app.post('/api/webhook', async (req, res) => {
    const update = req.body;
    
    // --- CRITICAL INITIALIZATION CHECK ---
    try {
        getFirebaseDb();
    } catch (e) {
        console.error("CRITICAL FIREBASE INITIALIZATION ERROR on webhook call:", e.message);
        if (update.message) {
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
            
            await sendChatAction(chatId, "typing"); 
            await handleUserMessage(chatId, text, user);
        
        } else if (update.callback_query) {
            const callback = update.callback_query;
            const chatId = callback.message.chat.id;
            const callbackData = callback.data;
            const messageId = callback.message.message_id;
            
            await answerCallbackQuery(callback.id);
            // Delete the keyboard once a button is clicked
            if (!callbackData.startsWith('cb_search_')) {
                await editMessageReplyMarkup(chatId, messageId, { inline_keyboard: [] });
            }

            await sendChatAction(chatId, "typing");
            
            const state = await getAppState(chatId);

            // --- ROUTE CALLBACKS ---
            if (callbackData.startsWith('cb_register_role_')) {
                await handleRoleSelection(chatId, callback.from, callbackData);
            } else if (callbackData.startsWith('cb_search_from_') || callbackData.startsWith('cb_search_to_') || callbackData.startsWith('cb_search_date_')) {
                 await handleSearchInputCallback(chatId, callbackData, state);
            } else if (callbackData === 'cb_payment_confirm') { 
                if (state.state === 'AWAITING_PAYMENT') {
                    await handlePaymentVerification(chatId, state.data);
                } else {
                    await sendMessage(chatId, "❌ No active payment to confirm.");
                }
            } else if (callbackData === 'cb_payment_cancel') { 
                await handlePaymentCancelCallback(chatId);
            } else if (callbackData === 'cb_book_bus') {
                await handleBusSearch(chatId);
            } else if (callbackData === 'cb_booking_single') {
                await handleBusSearch(chatId); 
            } else if (callbackData === 'cb_my_booking') {
                await handleBookingInfo(chatId);
            } else if (callbackData === 'cb_my_profile') {
                await handleUserProfile(chatId);
            } else if (callbackData === 'cb_add_bus_manager') {
                await handleManagerAddBus(chatId);
            } else if (callbackData === 'cb_inventory_sync') { 
                await handleInventorySyncSetup(chatId);
            } else if (callbackData === 'cb_update_phone') { 
                await handleUpdatePhoneNumberCallback(chatId);
            } else if (callbackData.startsWith('cb_select_gender_')) { 
                await handleGenderSelectionCallback(chatId, callbackData);
            } else if (callbackData === 'cb_add_passenger') { 
                await handleAddPassengerCallback(chatId);
            } else if (callbackData === 'cb_book_finish') { 
                if (state.state === 'AWAITING_BOOKING_ACTION') {
                    await createPaymentOrder(chatId, state.data);
                } else {
                    await sendMessage(chatId, "❌ You don't have an active booking to finish.");
                }
            } else if (callbackData === 'cb_help' || callbackData === 'cb_status') {
                await sendHelpMessage(chatId);
            } else if (callbackData === 'cb_booking_couple' || callbackData === 'cb_booking_family') {
                await sendMessage(chatId, MESSAGES.feature_wip);
            } else if (callbackData === 'cb_show_manifest_prompt') {
                await sendMessage(chatId, "📋 Please send the manifest command with the Bus ID.\nExample: <pre>Show manifest BUS101</pre>", "HTML");
            }
        }
    } catch (error) {
        console.error("Error in main handler:", error.message);
        const chatId = update.message?.chat.id || update.callback_query?.message.chat.id;
        if (chatId) {
            await sendMessage(chatId, "❌ A critical application error occurred. Please try /start again.");
        }
    }

    res.status(200).send('OK');
});

// --- RAZORPAY WEBHOOK ENDPOINT ---
app.post('/api/razorpay/webhook', async (req, res) => {
    const signature = req.headers['x-razorpay-signature'];
    const payload = req.rawBody; 

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
