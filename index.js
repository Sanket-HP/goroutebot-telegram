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

// --- Mock Tracking URL (Conceptual Client Link) ---
const MOCK_TRACKING_BASE_URL = "https://goroute-bot.web.app";

// --- Predefined City List (Used for suggested buttons only) ---
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

    // Detailed Ticket Confirmation (Used for Payment Success & Get Ticket)
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
    // Passenger Self-Service Messages
    ticket_not_found: "❌ E-Ticket for Booking ID <b>{bookingId}</b> not found or not confirmed.",
    booking_status_info: "📋 <b>Booking Status - {bookingId}</b>\n\nBus: {busID}\nSeats: {seats}\nStatus: <b>{status}</b>\nBooked On: {date}",
    seat_change_invalid: "❌ Invalid format. Use: <pre>Request seat change BOOKID NEW_SEAT</pre>",
    seat_change_wip: "🚧 Seat change request received for Booking <b>{bookingId}</b> (New seat: {newSeat}). This feature requires manager approval, and is currently pending implementation.",
    user_share_location_wip: "👨‍👩‍👧‍👦 <b>Personal Location Sharing:</b> This feature requires deep integration with your device's GPS and is under development. Please check back later!",
    fare_alert_invalid: "❌ Invalid format. Use: <pre>Alert on [FROM] to [TO] @ [HH:MM]</pre>",
    fare_alert_set: "🔔 <b>Fare Alert Set!</b> We will notify you if tickets for {from} to {to} around {time} become available or change significantly.",


    booking_details_error: "❌ <b>Error!</b> Please provide details in the format: <pre>[Name] / [Age] / [Aadhar Number]</pre>",
    seat_not_available: "❌ Seat {seatNo} on bus {busID} is already booked or invalid.",
    no_bookings: "📭 You don't have any active bookings.",
    booking_cancelled: "🗑️ <b>Booking Cancelled</b>\n\nBooking {bookingId} has been cancelled successfully.\n\nYour refund will be processed and credited within 6 hours of <i>{dateTime}</i>.", 
    
    // NEW SEARCH MESSAGES
    search_from: "🗺️ <b>Travel From:</b> Select a city below, or <b>type the full name of your city</b> to search:",
    search_to: "➡️ <b>Travel To:</b> Select a city below, or <b>type the full name of your city</b> to search:",
    search_city_invalid: "❌ City not found. Please ensure you type the full city name correctly (e.g., 'Pune'). Try again:",
    search_route_not_found: "❌ No routes available from <b>{city}</b>. Please check your spelling or try another city.",
    search_date: "📅 <b>Travel Date:</b> When do you plan to travel?",
    search_results: "🚌 <b>Search Results ({from} to {to}, {date})</b> 🚌\n\n",
    
    // NEW MANIFEST MESSAGE
    manifest_header: "📋 <b>Bus Manifest - {busID}</b>\nRoute: {from} → {to}\nDate: {date}\nTotal Booked Seats: {count}\n\n",
    manifest_entry: " • <b>Seat {seat}:</b> {name} (Aadhar {aadhar}) {gender}",
    no_manifest: "❌ No confirmed bookings found for bus {busID}.",

    // NEW TRACKING MESSAGES (Manager Flow)
    manager_tracking_prompt: "📍 <b>Start Tracking:</b> Enter the Bus ID that is now departing (e.g., <pre>BUS101</pre>):",
    manager_tracking_location_prompt: "📍 <b>Current Location:</b> Where is the bus departing from? (e.g., <pre>Mumbai Central Bus Stand</pre>):",
    manager_tracking_duration_prompt: "⏳ <b>Sharing Duration:</b> For how long should the location tracking run? (e.g., <pre>3 hours</pre>, <pre>45 minutes</pre>):",
    manager_tracking_session_active: "🚌 <b>Bus {busID} Tracking Session Active.</b> Ends at: <b>{stopTime}</b>. Select an action below:",
    manager_tracking_started: "✅ <b>LIVE Location Sharing Started for {busID}!</b>\n\nPassengers have been notified. Tracking will automatically stop at <b>{stopTime}</b>.",
    manager_tracking_stopped: "⏹️ <b>Tracking Stopped for {busID}.</b> The journey status is now 'Arrived'.",
    tracking_auto_stopped: "⏰ <b>Tracking Session Ended.</b> Bus {busID} tracking automatically stopped at {time} after {duration} and status set to 'Arrived'.",
    tracking_not_tracking: "❌ Bus <b>{busID}</b> has not started tracking yet or the route is finished. Please check with the operator.",
    passenger_tracking_info: "🚍 <b>Live Tracking - {busID}</b>\n\n📍 <b>Last Location:</b> {location}\n🕒 <b>Last Updated:</b> {time}\n\n🔗 <b>Tracking Link:</b> <a href='{trackingUrl}?bus={busID}'>Tap here to see the live map</a>",

    // Manager/Owner Trip/Staff Management
    manager_list_trips: "🚌 <b>Your Active Trips:</b>\n\n{tripList}",
    no_active_trips: "📭 You currently have no active or scheduled trips assigned.",
    owner_manage_staff_prompt: "👑 <b>Staff Management:</b> Enter the Chat ID to assign/revoke a role:",
    owner_staff_assigned: "✅ Chat ID <b>{chatId}</b> role updated to <b>manager</b>.",
    owner_staff_revoked: "✅ Chat ID <b>{chatId}</b> role revoked (set to user).",
    owner_invalid_format: "❌ Invalid format. Use: <pre>assign manager CHAT_ID</pre> or <pre>revoke manager CHAT_ID</pre>",
    owner_permission_denied: "❌ Only Bus Owners can manage staff roles.",
    
    // Revenue & Audit
    revenue_report: "💵 <b>Revenue Report for {date}</b>\n\nTotal Confirmed Bookings: {count}\nTotal Revenue (Gross): <b>₹{totalRevenue} INR</b>",
    bus_status_invalid: "❌ Invalid status. Status must be one of: <pre>scheduled</pre>, <pre>departed</pre>, <pre>arrived</pre>, or <pre>maintenance</pre>.",
    bus_status_updated: "✅ Bus <b>{busID}</b> status updated to <b>{status}</b>.",
    checkin_invalid: "❌ Invalid format. Use: <pre>Check-in BOOKID</pre>",
    checkin_success: "✅ Passenger check-in successful for Booking <b>{bookingId}</b>. Status set to 'Boarded'.",
    seat_release_invalid: "❌ Invalid format. Use: <pre>Release seat BUSID SEAT_NO</pre>",
    seat_release_success: "✅ Seat <b>{seatNo}</b> on Bus <b>{busID}</b> released and set to 'Available'.",
    aadhar_api_config_show: "🔒 <b>Aadhar Verification API Configuration</b>\n\nEndpoint URL: <code>{url}</code>\nStatus: {status}\n\nTo update, click '🔒 Setup Aadhar API' in the menu.",
    
    // Aadhar API Setup
    aadhar_api_init: "🔒 <b>Aadhar Verification Setup:</b> Enter the verification API endpoint URL:",
    aadhar_api_success: "✅ Aadhar API Endpoint set to: {url}",

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
        
        // FIX: Corrected 'base66' to 'base64'
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

/* --------------------- Utility Functions ---------------------- */

/**
 * Converts a string like "3 hours" or "45 minutes" to milliseconds.
 * @param {string} durationString 
 * @returns {number} Milliseconds
 */
function parseDurationToMs(durationString) {
    const parts = durationString.toLowerCase().trim().split(' ');
    if (parts.length !== 2) return 0;

    const value = parseInt(parts[0]);
    const unit = parts[1];

    if (isNaN(value)) return 0;

    if (unit.startsWith('minute')) {
        return value * 60 * 1000;
    } else if (unit.startsWith('hour')) {
        return value * 60 * 60 * 1000;
    }
    return 0;
}

/* --------------------- Live Tracking Cron Logic ---------------------- */

async function sendLiveLocationUpdates() {
    const db = getFirebaseDb();
    const updates = [];
    let updatesSent = 0;
    const currentTime = new Date();
    const notificationTime = currentTime.toLocaleTimeString('en-IN');
    const mockLocation = ["NH44 Checkpoint", "Toll Plaza 5", "Rest Area B", "City Outskirts", "Mid-route"];

    try {
        const busesSnapshot = await db.collection('buses').where('is_tracking', '==', true).get();
        
        for (const busDoc of busesSnapshot.docs) {
            const data = busDoc.data();
            const busID = data.bus_id;
            const managerId = data.manager_chat_id;
            
            // 1. Check for Automatic Stop
            if (data.tracking_stop_time) {
                const stopTime = data.tracking_stop_time.toDate();
                if (currentTime > stopTime) {
                    // Time elapsed: Stop tracking and notify manager
                    const startTime = busDoc.data().last_location_time.toDate();
                    const durationMs = stopTime.getTime() - startTime.getTime();
                    const durationString = `${Math.floor(durationMs / 3600000)}h ${Math.floor((durationMs % 3600000) / 60000)}m`;

                    await busDoc.ref.update({ is_tracking: false, status: 'arrived', tracking_stop_time: admin.firestore.FieldValue.delete() });
                    
                    const autoStopMsg = MESSAGES.tracking_auto_stopped
                        .replace('{busID}', busID)
                        .replace('{time}', notificationTime)
                        .replace('{duration}', durationString);
                    
                    if (managerId) updates.push(sendMessage(managerId, autoStopMsg, "HTML"));
                    continue; // Skip the regular update for this bus
                }
            }

            // 2. Regular Location Update
            const randomLocation = mockLocation[Math.floor(Math.random() * mockLocation.length)];

            await busDoc.ref.update({
                last_location_time: admin.firestore.FieldValue.serverTimestamp(),
                last_location_name: randomLocation
            });

            if (managerId) {
                const managerNotification = MESSAGES.tracking_passenger_info
                    .replace('{busID}', busID)
                    .replace('{location}', randomLocation)
                    .replace('{time}', notificationTime)
                    .replace('{trackingUrl}', MOCK_TRACKING_BASE_URL);
                
                updates.push(sendMessage(managerId, `🔔 [CRON UPDATE] ${managerNotification}`, "HTML"));
                updatesSent++;
            }
        }

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

        if (userRole === 'owner') {
            baseButtons.push(
                [{ text: "👑 Manage Staff", callback_data: "cb_owner_manage_staff" }],
                [{ text: "💵 Show Revenue", callback_data: "cb_show_revenue_prompt" }],
                [{ text: "⚠️ Set Bus Status", callback_data: "cb_set_bus_status_prompt" }],
                [{ text: "🔒 Setup Aadhar API", callback_data: "cb_aadhar_api_setup" }]
            );
        }
        
        if (userRole === 'manager' || userRole === 'owner') {
            baseButtons.push(
                [{ text: "➕ Add New Bus", callback_data: "cb_add_bus_manager" }],
                [{ text: "🚌 Show My Trips", callback_data: "cb_show_my_trips" }],
                [{ text: "📍 Start Route Tracking", callback_data: "cb_start_route_tracking_prompt" }],
                [{ text: "📋 Show Manifest", callback_data: "cb_show_manifest_prompt" }],
                [{ text: "🔗 Setup Inventory Sync", callback_data: "cb_inventory_sync" }],
                [{ text: "Check-In/Release", callback_data: "cb_checkin_release_prompt"}] 
            );
        }
        
        if (userRole === 'user' || userRole === 'unregistered') {
             baseButtons.push(
                [{ text: "🚌 Book a Bus", callback_data: "cb_book_bus" }],
                [{ text: "🎫 My Bookings", callback_data: "cb_my_booking" }],
                [{ text: "🔔 Set Fare Alert", callback_data: "cb_fare_alert_prompt"}]
            );
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

// --- FIX: Definition for starting the guided search flow ---
async function handleStartSearch(chatId) {
    try {
        // Use a subset of major cities for initial button suggestions
        const suggestedCities = MAJOR_CITIES.slice(0, 6); 
        
        const keyboard = {
            inline_keyboard: suggestedCities.map(loc => [{ text: loc, callback_data: `cb_search_from_${loc}` }])
        };

        await saveAppState(chatId, 'AWAITING_SEARCH_FROM', { step: 1 }); 
        await sendMessage(chatId, MESSAGES.search_from, "HTML", keyboard);

    } catch (e) {
        console.error('Error starting search:', e.message);
        await sendMessage(chatId, MESSAGES.db_error);
    }
}
// -----------------------------------------------------------

// --- Booking Entry Point ---
async function handleBusSearch(chatId) {
    await handleStartSearch(chatId);
}
// -----------------------------

// --- OWNER: REVENUE REPORT ---

async function handleShowRevenue(chatId, text) {
    const userRole = await getUserRole(chatId);
    if (userRole !== 'owner') return await sendMessage(chatId, MESSAGES.owner_permission_denied);

    const match = text.match(/show revenue\s+(\d{4}-\d{2}-\d{2})/i);
    const targetDate = match ? match[1] : new Date().toISOString().split('T')[0];

    try {
        const db = getFirebaseDb();
        const snapshot = await db.collection('bookings')
            .where('status', '==', 'confirmed')
            .get();

        let totalRevenue = 0;
        let confirmedCount = 0;

        snapshot.forEach(doc => {
            const data = doc.data();
            const bookingDate = data.created_at ? data.created_at.toDate().toISOString().split('T')[0] : null;
            
            if (bookingDate === targetDate) {
                totalRevenue += data.total_paid || 0;
                confirmedCount++;
            }
        });

        const response = MESSAGES.revenue_report
            .replace('{date}', targetDate)
            .replace('{count}', confirmedCount)
            .replace('{totalRevenue}', (totalRevenue / 100).toFixed(2));
            
        await sendMessage(chatId, response, "HTML");

    } catch (e) {
        console.error('❌ Show Revenue Error:', e.message);
        await sendMessage(chatId, MESSAGES.db_error);
    }
}

// --- OWNER: GLOBAL BUS STATUS ---

async function handleSetBusStatus(chatId, text) {
    const userRole = await getUserRole(chatId);
    if (userRole !== 'owner') return await sendMessage(chatId, MESSAGES.owner_permission_denied);

    const match = text.match(/set status\s+(BUS\d+)\s+(scheduled|departed|arrived|maintenance)/i);
    
    if (!match) return await sendMessage(chatId, MESSAGES.bus_status_invalid + "\nExample: <pre>Set status BUS101 maintenance</pre>", "HTML");

    const busID = match[1].toUpperCase();
    const newStatus = match[2].toLowerCase();

    try {
        const db = getFirebaseDb();
        const busRef = db.collection('buses').doc(busID);
        const busDoc = await busRef.get();

        if (!busDoc.exists) return await sendMessage(chatId, `❌ Bus ID <b>${busID}</b> not found.`);

        const updateData = { status: newStatus };

        // If setting to maintenance or arrived, stop tracking
        if (newStatus === 'maintenance' || newStatus === 'arrived') {
            updateData.is_tracking = false;
        }

        await busRef.update(updateData);
        await sendMessage(chatId, MESSAGES.bus_status_updated.replace('{busID}', busID).replace('{status}', newStatus.toUpperCase()), "HTML");

    } catch (e) {
        console.error('❌ Set Bus Status Error:', e.message);
        await sendMessage(chatId, MESSAGES.db_error);
    }
}

// --- MANAGER: CHECK-IN & SEAT RELEASE ---

async function handleCheckIn(chatId, text) {
    const userRole = await getUserRole(chatId);
    if (userRole !== 'manager' && userRole !== 'owner') return await sendMessage(chatId, "❌ Permission denied.");

    const match = text.match(/check-in\s+(BOOK\d+)/i);
    if (!match) return await sendMessage(chatId, MESSAGES.checkin_invalid);

    const bookingId = match[1].toUpperCase();

    try {
        const db = getFirebaseDb();
        const bookingRef = db.collection('bookings').doc(bookingId);
        const bookingDoc = await bookingRef.get();

        if (!bookingDoc.exists || bookingDoc.data().status !== 'confirmed') {
            return await sendMessage(chatId, `❌ Booking <b>${bookingId}</b> not found or not confirmed.`);
        }

        await bookingRef.update({ 
            status: 'boarded',
            check_in_time: admin.firestore.FieldValue.serverTimestamp()
        });

        await sendMessage(chatId, MESSAGES.checkin_success.replace('{bookingId}', bookingId), "HTML");

    } catch (e) {
        console.error('❌ Check-in Error:', e.message);
        await sendMessage(chatId, MESSAGES.db_error);
    }
}

async function handleSeatRelease(chatId, text) {
    const userRole = await getUserRole(chatId);
    if (userRole !== 'manager' && userRole !== 'owner') return await sendMessage(chatId, "❌ Permission denied.");

    const match = text.match(/release seat\s+(BUS\d+)\s+([A-Z0-9]+)/i);
    if (!match) return await sendMessage(chatId, MESSAGES.seat_release_invalid);

    const busID = match[1].toUpperCase();
    const seatNo = match[2].toUpperCase();
    const seatDocId = `${busID}-${seatNo}`;

    try {
        const db = getFirebaseDb();
        const seatRef = db.collection('seats').doc(seatDocId);
        const seatDoc = await seatRef.get();

        if (!seatDoc.exists || seatDoc.data().status === 'available') {
            return await sendMessage(chatId, `❌ Seat <b>${seatNo}</b> on bus <b>${busID}</b> is already available or does not exist.`);
        }

        // Release the seat
        await seatRef.update({
            status: 'available',
            booking_id: admin.firestore.FieldValue.delete(),
            temp_chat_id: admin.firestore.FieldValue.delete(),
            gender: admin.firestore.FieldValue.delete()
        });

        await sendMessage(chatId, MESSAGES.seat_release_success.replace('{seatNo}', seatNo).replace('{busID}', busID), "HTML");

    } catch (e) {
        console.error('❌ Seat Release Error:', e.message);
        await sendMessage(chatId, MESSAGES.db_error);
    }
}

// --- MANAGER: AADHAR API CONFIG VIEW ---

async function handleShowAadharApiConfig(chatId) {
    const userRole = await getUserRole(chatId);
    if (userRole !== 'manager' && userRole !== 'owner') return await sendMessage(chatId, "❌ Permission denied.");

    try {
        const db = getFirebaseDb();
        const doc = await db.collection('settings').doc('aadhar_verification').get();
        
        const url = doc.exists ? doc.data().endpoint_url : 'N/A';
        const status = doc.exists && url !== 'N/A' ? '✅ Active' : '🔴 Not Configured';

        const response = MESSAGES.aadhar_api_config_show
            .replace('{url}', url)
            .replace('{status}', status);
        
        await sendMessage(chatId, response, "HTML");

    } catch (e) {
        console.error('❌ Show Aadhar API Config Error:', e.message);
        await sendMessage(chatId, MESSAGES.db_error);
    }
}

// --- PASSENGER: FARE ALERT ---

async function handleFareAlertSetup(chatId, text) {
    const match = text.match(/alert on\s+([^\s@]+)\s+to\s+([^\s@]+)\s+@\s+(\d{2}:\d{2})/i);
    if (!match) return await sendMessage(chatId, MESSAGES.fare_alert_invalid);

    const from = match[1].trim();
    const to = match[2].trim();
    const time = match[3].trim();

    try {
        const db = getFirebaseDb();
        await db.collection('fare_alerts').add({
            chat_id: String(chatId),
            from: from,
            to: to,
            time: time,
            created_at: admin.firestore.FieldValue.serverTimestamp()
        });

        const response = MESSAGES.fare_alert_set.replace('{from}', from).replace('{to}', to).replace('{time}', time);
        await sendMessage(chatId, response, "HTML");

    } catch (e) {
        console.error('❌ Fare Alert Setup Error:', e.message);
        await sendMessage(chatId, MESSAGES.db_error);
    }
}

/* --------------------- Core Handlers (Remaining) ---------------------- */

async function handleShowMyTrips(chatId) {
    const userRole = await getUserRole(chatId);
    if (userRole !== 'manager' && userRole !== 'owner') {
        return await sendMessage(chatId, "❌ You do not have permission to view trips.");
    }

    try {
        const db = getFirebaseDb();
        const snapshot = await db.collection('buses')
            .where('manager_chat_id', '==', String(chatId))
            .get();

        if (snapshot.empty) {
            return await sendMessage(chatId, MESSAGES.no_active_trips);
        }
        
        const buses = snapshot.docs.map(doc => doc.data());
        buses.sort((a, b) => (a.departure_time > b.departure_time) ? 1 : -1);

        let tripList = '';
        buses.forEach(data => {
            const date = data.departure_time.split(' ')[0];
            tripList += `\n• <b>${data.bus_id}</b>: ${data.from} → ${data.to}\n`;
            tripList += `  Status: <b>${data.status.toUpperCase()}</b> | Date: ${date}`;
        });

        const response = MESSAGES.manager_list_trips.replace('{tripList}', tripList);
        await sendMessage(chatId, response, "HTML");

    } catch (e) {
        console.error('❌ Show My Trips Error:', e.message);
        await sendMessage(chatId, MESSAGES.db_error);
    }
}

// ... (Rest of existing handlers)

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
        
        // --- CUSTOM SEAT MAP UI GENERATION ---
        let seatMap = `🚍 <b>Seat Map - ${busID}</b>\n`;
        seatMap += `📍 ${busInfo.from} → ${busInfo.to}\n`;
        seatMap += `📅 ${busInfo.date} 🕒 ${busInfo.time}\n\n`;
        seatMap += `Legend: ✅ Available • 🪑 Seater • 🛏️ Sleeper (U/L)\n`;
        seatMap += `⚫ Booked • 🚺 Female • 🚹 Male\n\n`;
        seatMap += `[ Aisle Layout: Left(1+2) | Right(2+2) Seater / Left(1 Upper/Lower) | Right(2 Upper/Lower) Sleeper ]\n\n`;

        // Using a loop that accounts for the complex 2-column + 1-column sleeper setup
        for (let row = 1; row <= 10; row++) {
            let line = '';

            // --- SEAT/SLEEPER COLUMN DEFINITION ---
            // Left Sleeper/Seater Section (Row 1-10)
            const leftSeats = [
                // Left 1 seat: Sleeper Upper (1A, 2A, ...)
                [`${row}A`, row <= 10 ? 'Sleeper Upper' : 'Seater'],
                // Left 2 seats: Seater (1B, 2B) or Left Sleeper Lower (1B, 2B, ...)
                [`${row}B`, row <= 10 ? 'Sleeper Lower' : 'Seater'],
                // Gap (1 seat width) 
                [`${row}G`, 'Gap'],
            ];

            // Right Sleeper/Seater Section (Row 1-10)
            const rightSeats = [
                // Right 1 seat: Seater (1C, 2C) or Sleeper Upper (1C, 2C, ...)
                [`${row}C`, row <= 10 ? 'Sleeper Upper' : 'Seater'],
                // Right 2 seats: Seater (1D, 2D) or Sleeper Lower (1D, 2D, ...)
                [`${row}D`, row <= 10 ? 'Sleeper Lower' : 'Seater'],
                [`${row}E`, row <= 10 ? 'Sleeper Upper' : 'Seater'], // New Seat E
                [`${row}F`, row <= 10 ? 'Sleeper Lower' : 'Seater'], // New Seat F
            ];
            
            // --- COMBINED ROW RENDERING (Left Side) ---
            for (const [seatNo, seatType] of leftSeats) {
                if (seatType === 'Gap') {
                    line += `       `; // 7 spaces for alignment
                    continue;
                }
                if (row > 10 && (seatNo.endsWith('A') || seatNo.endsWith('B'))) continue; // Stop standard seating at row 10

                const data = seatStatus[seatNo] || {};
                const status = data.status || '⬜';
                const typeIcon = seatType.includes('Sleeper') ? '🛏️' : '🪑';
                let content = '';

                if (status === 'available') {
                    content = `${seatNo.padEnd(3)}${typeIcon}✅`;
                } else if (status === 'booked' || status === 'locked') {
                    const genderIcon = data.gender === 'F' ? '🚺' : '🚹';
                    content = `${seatNo.padEnd(3)}${typeIcon}${genderIcon}⚫`; 
                } else {
                    content = `${seatNo.padEnd(3)}⬜`; 
                }
                line += `${content.padEnd(10)}`;
            }
            
            line += `  🚌  `; // Center Aisle

            // --- COMBINED ROW RENDERING (Right Side) ---
            for (const [seatNo, seatType] of rightSeats) {
                if (row > 10 && (seatNo.endsWith('C') || seatNo.endsWith('D') || seatNo.endsWith('E') || seatNo.endsWith('F'))) continue; // Stop standard seating at row 10
                
                const data = seatStatus[seatNo] || {};
                const status = data.status || '⬜';
                const typeIcon = seatType.includes('Sleeper') ? '🛏️' : '🪑';
                let content = '';
                
                if (status === 'available') {
                    content = `${seatNo.padEnd(3)}${typeIcon}✅`;
                } else if (status === 'booked' || status === 'locked') {
                    const genderIcon = data.gender === 'F' ? '🚺' : '🚹';
                    content = `${seatNo.padEnd(3)}${typeIcon}${genderIcon}⚫`; 
                } else {
                    content = `${seatNo.padEnd(3)}⬜`; 
                }
                
                line += `${content.padEnd(10)}`;
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


// ... (Rest of the handlers remain the same)

async function handleShowLiveLocation(chatId, text) {
    const match = text.match(/show live location\s+(BUS\d+)/i);
    if (!match) return await sendMessage(chatId, "❌ Please specify Bus ID.\nExample: <pre>Show live location BUS101</pre>", "HTML");

    const busID = match[1].toUpperCase();

    try {
        const db = getFirebaseDb();
        const busDoc = await db.collection('buses').doc(busID).get();

        if (!busDoc.exists || !busDoc.data().is_tracking) {
            return await sendMessage(chatId, MESSAGES.tracking_not_tracking.replace('{busID}', busID), "HTML");
        }

        const busData = busDoc.data();
        const lastUpdateTime = busData.last_location_time ? 
            busData.last_location_time.toDate().toLocaleTimeString('en-IN') : 'N/A';
            
        const trackingUrl = MOCK_TRACKING_BASE_URL; 

        const response = MESSAGES.passenger_tracking_info
            .replace('{busID}', busID)
            .replace('{location}', busData.last_location_name || 'Location update pending')
            .replace('{time}', lastUpdateTime)
            .replace('{trackingUrl}', trackingUrl);
            
        await sendMessage(chatId, response, "HTML");
        
    } catch (e) {
        console.error('❌ Passenger Tracking Error:', e.message);
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
            
            // --- NEW TRACKING FLOW ---
            case 'MANAGER_TRACKING_BUS_ID':
                const busMatch = text.match(/(BUS\d+)/i);
                const busID = busMatch ? busMatch[1].toUpperCase() : null;

                if (!busID) return await sendMessage(chatId, "❌ Invalid Bus ID format. Try again:", "HTML");
                
                const busDoc = await db.collection('buses').doc(busID).get();
                if (!busDoc.exists) return await sendMessage(chatId, `❌ Bus ID <b>${busID}</b> not found.`);
                
                data.busID = busID;
                nextState = 'MANAGER_TRACKING_LOCATION';
                response = MESSAGES.manager_tracking_location_prompt;
                break;
                
            case 'MANAGER_TRACKING_LOCATION':
                data.trackingLocation = text.trim();
                nextState = 'MANAGER_TRACKING_DURATION';
                response = MESSAGES.manager_tracking_duration_prompt;
                break;
                
            case 'MANAGER_TRACKING_DURATION':
                const durationMs = parseDurationToMs(text);
                if (durationMs === 0 || durationMs < (15 * 60 * 1000)) { // Must be at least 15 mins for cron job visibility
                    return await sendMessage(chatId, "❌ Invalid or too short duration. Please use format 'X hours' or 'Y minutes' (min 15 min):", "HTML");
                }
                
                data.trackingDuration = text.trim(); // Save string for confirmation
                
                // Final confirmation and start
                const stopTime = new Date(Date.now() + durationMs);
                const stopTimeStr = stopTime.toLocaleTimeString('en-IN');
                
                // Call the start function to save data and notify passengers
                await handleTrackingAction(chatId, 'start_live', data.busID);
                
                // Response is handled inside handleTrackingAction, so return early
                return; 
                
            // --- EXISTING FLOW CASES ---

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
                        status: 'scheduled',
                        is_tracking: false, // Tracking is off by default
                        last_location_name: from,
                        last_location_time: admin.firestore.FieldValue.serverTimestamp()
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

// --- FIX: Re-added missing startUserRegistration definition ---
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
// -----------------------------------------------------

// ... (Rest of the handlers remain the same)

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
        if (state.state === 'AWAITING_SEARCH_FROM' || state.state === 'AWAITING_SEARCH_TO' || state.state === 'AWAITING_SEARCH_DATE') {
             await handleSearchTextInput(chatId, text, state);
        } else if (state.state.startsWith('AWAITING_PASSENGER') || state.state.startsWith('AWAITING_GENDER')) {
            await handleBookingInput(chatId, text, state);
        } else if (state.state.startsWith('MANAGER_ADD_BUS') || state.state.startsWith('MANAGER_ADD_SEAT')) {
            await handleManagerInput(chatId, text, state);
        } else if (state.state.startsWith('MANAGER_TRACKING')) {
            await handleManagerInput(chatId, text, state);
        } else if (state.state.startsWith('MANAGER_AADHAR_API_SETUP')) { 
            await handleManagerInput(chatId, text, state);
        } else if (state.state.startsWith('MANAGER_AWAITING_LIVE_ACTION')) { 
            const busID = state.data.busID;
             const keyboard = {
                inline_keyboard: [
                    [{ text: "📍 Share Live Location", callback_data: `cb_live_action_start_${busID}` }],
                    [{ text: "⏹️ Stop Tracking", callback_data: `cb_live_action_stop_${busID}` }]
                ]
            };
            await sendMessage(chatId, MESSAGES.manager_tracking_session_active.replace('{busID}', busID) + "\n\nPlease use the buttons below to control the session.", "HTML", keyboard);
        } else if (state.state === 'AWAITING_NEW_PHONE') { 
            await handlePhoneUpdateInput(chatId, text);
        } else if (state.state.startsWith('MANAGER_SYNC_SETUP')) {
            await handleInventorySyncInput(chatId, text, state);
        } else if (state.state === 'AWAITING_PAYMENT') {
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
    
    // OWNER STAFF COMMANDS
    if (textLower.startsWith('assign manager') || textLower.startsWith('revoke manager')) {
        await handleStaffDelegation(chatId, text);
    }
    else if (textLower.startsWith('show revenue')) { // OWNER REVENUE REPORT
        await handleShowRevenue(chatId, text);
    }
    else if (textLower.startsWith('set status')) { // OWNER GLOBAL STATUS
        await handleSetBusStatus(chatId, text);
    }
    // PASSENGER SELF-SERVICE COMMANDS
    else if (textLower.startsWith('get ticket')) {
        await handleGetTicket(chatId, text);
    }
    else if (textLower.startsWith('check status')) {
        await handleCheckStatus(chatId, text);
    }
    else if (textLower.startsWith('request seat change')) { 
        await handleSeatChangeRequest(chatId, text);
    }
    else if (textLower.startsWith('alert on')) { // PASSENGER FARE ALERT
        await handleFareAlertSetup(chatId, text);
    }
    else if (textLower.startsWith('share my location') || textLower.startsWith('share location')) {
        await handleUserShareLocation(chatId);
    }
    // MANAGER COMMANDS
    else if (textLower.startsWith('check-in')) { // MANAGER CHECK-IN
        await handleCheckIn(chatId, text);
    }
    else if (textLower.startsWith('release seat')) { // MANAGER SEAT RELEASE
        await handleSeatRelease(chatId, text);
    }
    else if (textLower.startsWith('show aadhar api config')) { // MANAGER VIEW CONFIG
        await handleShowAadharApiConfig(chatId);
    }
    // GENERAL COMMANDS
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
    else if (textLower.startsWith('show manifest')) {
        await handleShowManifest(chatId, text);
    }
    else if (textLower.startsWith('start tracking')) { 
        await handleStartTrackingCommand(chatId, text);
    }
    else if (textLower.startsWith('track bus')) { 
        await handlePassengerTracking(chatId, text);
    }
    else if (textLower.startsWith('show live location')) { 
        await handleShowLiveLocation(chatId, text);
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
            // Delete the keyboard unless it's a search step or tracking action (which need to persist/re-render)
            if (!callbackData.startsWith('cb_search_') && !callbackData.startsWith('cb_live_action_')) {
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
            } else if (callbackData === 'cb_aadhar_api_setup') { 
                const userRole = await getUserRole(chatId);
                if (userRole !== 'manager' && userRole !== 'owner') return await sendMessage(chatId, "❌ Permission denied.");
                await saveAppState(chatId, 'MANAGER_AADHAR_API_SETUP', {});
                await sendMessage(chatId, MESSAGES.aadhar_api_init, "HTML");
            } else if (callbackData === 'cb_owner_manage_staff') {
                 const userRole = await getUserRole(chatId);
                 if (userRole !== 'owner') return await sendMessage(chatId, MESSAGES.owner_permission_denied);
                 await sendMessage(chatId, MESSAGES.owner_manage_staff_prompt, "HTML");
            } else if (callbackData === 'cb_show_my_trips') { 
                await handleShowMyTrips(chatId);
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
            } else if (callbackData === 'cb_start_route_tracking_prompt') { 
                await handleStartTrackingFlow(chatId);
            } else if (callbackData === 'cb_show_revenue_prompt') {
                await sendMessage(chatId, "💵 Please specify the date for the revenue report.\nExample: <pre>Show revenue 2025-11-02</pre>", "HTML");
            } else if (callbackData === 'cb_set_bus_status_prompt') {
                await sendMessage(chatId, "⚠️ Please send the bus status command.\nExample: <pre>Set status BUS101 maintenance</pre>", "HTML");
            } else if (callbackData === 'cb_fare_alert_prompt') {
                await sendMessage(chatId, "🔔 Please specify your desired route and time.\nExample: <pre>Alert on Pune to Mumbai @ 07:30</pre>", "HTML");
            } else if (callbackData === 'cb_checkin_release_prompt') {
                 await sendMessage(chatId, "🚌 Send <pre>Check-in BOOKID</pre> or <pre>Release seat BUSID SEAT_NO</pre>", "HTML");
            } else if (callbackData.startsWith('cb_live_action_')) {
                const parts = callbackData.split('_');
                const action = parts[2] === 'start' ? 'start_live' : 'stop';
                const busID = parts[3];
                await handleTrackingAction(chatId, action, busID);
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
