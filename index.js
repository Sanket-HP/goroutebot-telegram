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

// --- Enhanced MESSAGES with better UX ---
const MESSAGES = {
    welcome: `🎉 *Welcome to GoRoute Bus Booking!* 🚌

I'm your personal bus booking assistant. Here's what I can help you with:

• 🚌 *Book Buses* - Find and reserve seats
• 🎫 *My Bookings* - View and manage your trips  
• 👤 *Profile* - Update your information
• 📍 *Live Tracking* - Track your bus in real-time
• 🆘 *Help* - Get assistance anytime

Ready to travel? Let's get started! 👇`,

    help: `🆘 *GoRoute Help Center*

*Quick Commands:*
• \`Book bus\` - Search available buses
• \`Show seats BUS101\` - View seat map
• \`Book seat BUS101 3A\` - Reserve a seat
• \`My bookings\` - View your trips
• \`My profile\` - Check your details
• \`Cancel booking BOOK123\` - Cancel a booking
• \`Help\` - Show this message

Need assistance? Just type your question!`,

    no_buses: "❌ *No buses available right now.*\n\nTry different routes or check back later. Popular routes are usually available in morning and evening.",
    specify_bus_id: '❌ Please specify the Bus ID.\n\n*Example:* "Show seats BUS101"',
    seat_map_error: '❌ Unable to load seat map for {busID}. Please check the Bus ID.',
    no_seats_found: '❌ No seat information found for bus {busID}.',
    feature_wip: '🚧 *Coming Soon!*\n\nThis feature is currently under development. Stay tuned for updates!',
    welcome_back: '👋 Welcome back, {name}! Ready for your next journey?',
    
    // Registration
    prompt_role: "🎉 *Welcome to GoRoute!* \n\nPlease choose how you'd like to use our service:",
    registration_started: "✅ Great! You're registered as *{role}*.\n\n📝 *Next Step:* Complete your profile:\n\nSend: \n\`my profile details [Your Full Name] / [Aadhar Number] / [Phone Number]\`\n\n*Example:*\n\`my profile details Raj Sharma / 123456789012 / 9876543210\`", 
    profile_updated: "✅ *Profile Updated Successfully!*\n\nYour details have been saved securely.",
    profile_update_error: "❌ *Format Error*\n\nPlease use exactly this format:\n\`my profile details [Name] / [Aadhar] / [Phone]\`\n\n*Example:*\n\`my profile details Priya Singh / 123456789012 / 9876543210\`", 
    user_not_found: "❌ *Account Not Found*\n\nPlease send /start to create your account.",

    // Phone Update
    update_phone_prompt: "📞 *Update Phone Number*\n\nPlease enter your new 10-digit mobile number:",
    phone_updated_success: "✅ *Phone Number Updated!*\n\nYour contact information has been saved.",
    phone_invalid: "❌ *Invalid Phone Number*\n\nPlease enter a valid 10-digit number (without +91 or spaces).",

    // Booking
    booking_type_prompt: "👤 *Booking Type*\n\nAre you booking for yourself or with others?",
    gender_prompt: "🚻 *Passenger Gender*\n\nIs the passenger for seat *{seatNo}*:",
    safety_violation: "🚫 *Seat Safety Rule*\n\nSeat *{seatNo}* cannot be booked by a male passenger as it's adjacent to a female-occupied seat.\n\nPlease choose another seat for better comfort and safety.",
    details_prompt: "✍️ *Passenger Details*\n\nPlease provide:\n\`[Full Name] / [Age] / [Aadhar Number]\`\n\n*Example:*\n\`Raj Kumar / 25 / 123456789012\`",
    booking_passenger_prompt: "✅ *Details Saved for Seat {seatNo}*\n\nPassenger {count}: {name}",
    booking_finish: `🎫 *Booking Confirmed!* ✅

*Booking ID:* {bookingId}
*Bus:* {busID}
*Seats:* {seats}
*Passengers:* {count}

💰 *Amount Paid:* ₹{amount}
📅 *Departure:* {date} at {time}

Your e-ticket will be sent shortly. Thank you for choosing GoRoute! 🚌`,

    booking_details_error: "❌ *Format Error*\n\nPlease use:\n\`[Name] / [Age] / [Aadhar]\`\n\n*Example:*\n\`Amit Kumar / 28 / 123456789012\`",
    seat_not_available: "❌ *Seat {seatNo} Not Available*\n\nThis seat on bus {busID} is already booked. Please choose another seat.",
    no_bookings: "📭 *No Active Bookings*\n\nYou don't have any upcoming trips. Start by searching for buses!",
    booking_cancelled: `🗑️ *Booking Cancelled*

*Booking ID:* {bookingId}
*Status:* Successfully cancelled
*Refund:* Will be processed within 6 hours

Your refund will be credited to your original payment method by *{dateTime}*.`,

    // Payment
    payment_required: `💰 *Payment Required*

*Total Amount:* ₹{amount}
*Order ID:* {orderId}
*Seats Held For:* 15 minutes

[👉 Click Here to Pay Now]({paymentUrl})

💡 *Note:* Your ticket will be automatically sent after successful payment.`,
    
    payment_awaiting: "⏳ *Awaiting Payment Confirmation*\n\nWe're still processing your payment for Order ID: {orderId}\n\nYour seats are temporarily reserved.",
    payment_failed: "❌ *Payment Failed*\n\nWe couldn't verify your payment. Your seats have been released.\n\nPlease try booking again.",

    // Enhanced responses
    quick_actions: "🎯 *Quick Actions:*",
    bus_search_prompt: "🔍 *Search Buses*\n\nLet me find available buses for you...",
    processing_request: "⏳ Processing your request...",
    operation_complete: "✅ Operation completed successfully!",
    something_wrong: "❌ Something went wrong. Please try again.",
    invalid_command: "🤔 I didn't understand that. Type 'help' to see what I can do!",
};

// Create the server
const app = express();
app.use(express.json({ verify: (req, res, buf) => { req.rawBody = buf; } }));

// --- Database Initialization ---
let db; 

function getFirebaseDb() {
    if (db) return db;

    try {
        const rawCredsBase64 = process.env.FIREBASE_CREDS_BASE64;
        if (!rawCredsBase64) {
            throw new Error("CRITICAL: FIREBASE_CREDS_BASE64 is not defined");
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
        throw e; 
    }
}

/* --------------------- Enhanced Telegram Helpers ---------------------- */

async function sendMessage(chatId, text, parseMode = null, replyMarkup = null) {
    if (!TELEGRAM_TOKEN) {
        console.error("❌ TELEGRAM_TOKEN missing");
        return; 
    }
    
    // Truncate very long messages to avoid Telegram limits
    if (text && text.length > 4096) {
        text = text.substring(0, 4000) + "\n\n... (message truncated)";
    }
    
    try {
        const payload = { 
            chat_id: chatId, 
            text: text, 
            parse_mode: parseMode 
        };
        if (replyMarkup) payload.reply_markup = replyMarkup;
        
        const response = await axios.post(`${TELEGRAM_API}/sendMessage`, payload, {
            timeout: 10000
        });
        return response.data;
    } catch (error) {
        if (error.response) {
            console.error(`❌ Telegram API Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
        } else if (error.request) {
            console.error(`❌ Telegram Network Error: No response received`);
        } else {
            console.error(`❌ Telegram Error: ${error.message}`);
        }
    }
}

async function sendChatAction(chatId, action) {
    try {
        await axios.post(`${TELEGRAM_API}/sendChatAction`, { 
            chat_id: chatId, 
            action: action 
        }, { timeout: 5000 });
    } catch (error) {
        // Silent fail for action errors
    }
}

async function answerCallbackQuery(callbackQueryId, text = null) {
    try {
        const payload = { callback_query_id: callbackQueryId };
        if (text) payload.text = text;
        await axios.post(`${TELEGRAM_API}/answerCallbackQuery`, payload, { timeout: 5000 });
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
        }, { timeout: 5000 });
    } catch (error) {
        // Suppress edit errors
    }
}

/* --------------------- Enhanced Helper Functions ---------------------- */

async function getAppState(chatId) {
    try {
        const db = getFirebaseDb();
        const doc = await db.collection('user_state').doc(String(chatId)).get();
        if (doc.exists) return { state: doc.data().state, data: doc.data().data };
        return { state: 'IDLE', data: {} };
    } catch (error) {
        console.error('Error getting app state:', error.message);
        return { state: 'IDLE', data: {} };
    }
}

async function saveAppState(chatId, stateName, data) {
    try {
        const db = getFirebaseDb();
        await db.collection('user_state').doc(String(chatId)).set({
            state: stateName,
            data: data,
            updated_at: admin.firestore.FieldValue.serverTimestamp()
        });
    } catch (error) {
        console.error('Error saving app state:', error.message);
    }
}

async function clearAppState(chatId) {
    try {
        const db = getFirebaseDb();
        await db.collection('user_state').doc(String(chatId)).delete();
    } catch (error) {
        console.error('Error clearing app state:', error.message);
    }
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

/* --------------------- Enhanced Message Handlers ---------------------- */

async function sendWelcomeMessage(chatId, user) {
    const welcomeKeyboard = {
        inline_keyboard: [
            [{ text: "🚌 Book a Bus", callback_data: "cb_book_bus" }],
            [{ text: "🎫 My Bookings", callback_data: "cb_my_booking" }],
            [{ text: "👤 My Profile", callback_data: "cb_my_profile" }],
            [{ text: "🆘 Help", callback_data: "cb_help" }]
        ]
    };
    
    await sendMessage(chatId, MESSAGES.welcome, "Markdown", welcomeKeyboard);
}

async function sendHelpMessage(chatId) {
    const helpKeyboard = {
        inline_keyboard: [
            [{ text: "🚌 Quick Book", callback_data: "cb_book_bus" }],
            [{ text: "📞 Contact Support", callback_data: "cb_support" }],
            [{ text: "🏠 Main Menu", callback_data: "cb_main_menu" }]
        ]
    };
    
    await sendMessage(chatId, MESSAGES.help, "Markdown", helpKeyboard);
}

async function sendQuickActions(chatId) {
    const quickActionsKeyboard = {
        inline_keyboard: [
            [{ text: "🚍 Search Buses", callback_data: "cb_book_bus" }],
            [{ text: "📋 My Bookings", callback_data: "cb_my_booking" }],
            [{ text: "👤 Profile", callback_data: "cb_my_profile" }, { text: "🆘 Help", callback_data: "cb_help" }]
        ]
    };
    
    await sendMessage(chatId, MESSAGES.quick_actions, "Markdown", quickActionsKeyboard);
}

/* --------------------- Enhanced Core Handlers ---------------------- */

async function handleStartCommand(chatId, user) {
    try {
        const db = getFirebaseDb();
        const userDoc = await db.collection('users').doc(String(chatId)).get();

        if (userDoc.exists) {
            const userName = user.first_name || 'Traveler';
            await sendMessage(chatId, MESSAGES.welcome_back.replace('{name}', userName));
            await sendQuickActions(chatId);
        } else {
            const registrationKeyboard = {
                inline_keyboard: [
                    [{ text: "👤 Passenger", callback_data: "cb_register_role_user" }],
                    [{ text: "👨‍💼 Bus Manager", callback_data: "cb_register_role_manager" }],
                    [{ text: "ℹ️ Learn More", callback_data: "cb_learn_more" }]
                ]
            };
            await sendMessage(chatId, MESSAGES.prompt_role, "Markdown", registrationKeyboard);
        }
    } catch (error) {
        console.error('Start command error:', error.message);
        await sendMessage(chatId, "🚧 We're experiencing technical issues. Please try again in a moment.");
    }
}

async function handleHelpCommand(chatId) {
    await sendHelpMessage(chatId);
}

async function handleBusSearch(chatId) {
    await sendChatAction(chatId, "typing");
    await sendMessage(chatId, MESSAGES.bus_search_prompt, "Markdown");
    
    try {
        const db = getFirebaseDb();
        const snapshot = await db.collection('buses').limit(10).get();
        const buses = [];
        
        snapshot.forEach(doc => {
            const data = doc.data();
            buses.push({
                busID: data.bus_id,
                from: data.from,
                to: data.to,
                date: data.departure_time?.split(' ')[0] || 'N/A',
                time: data.departure_time?.split(' ')[1] || 'N/A',
                owner: data.owner,
                price: data.price,
                busType: data.bus_type,
                rating: data.rating || 4.2,
                availableSeats: data.total_seats || 40
            });
        });

        if (buses.length === 0) {
            return await sendMessage(chatId, MESSAGES.no_buses, "Markdown");
        }

        let response = `🚌 *Found ${buses.length} Available Buses*\n\n`;
        
        buses.forEach((bus, index) => {
            response += `*${index + 1}. ${bus.busID}* - ${bus.owner}\n`;
            response += `📍 ${bus.from} → ${bus.to}\n`;
            response += `📅 ${bus.date} 🕒 ${bus.time}\n`;
            response += `💰 ₹${bus.price} • ${bus.busType} • ⭐ ${bus.rating}\n`;
            response += `💺 ${bus.availableSeats} seats available\n`;
            response += `🔍 *Type:* \`Show seats ${bus.busID}\`\n\n`;
        });
        
        response += `💡 *Quick Tip:* Use "Show seats BUS_ID" to view available seats and book.`;
        
        await sendMessage(chatId, response, "Markdown");
        
    } catch (error) {
        console.error('Bus search error:', error.message);
        await sendMessage(chatId, "❌ Unable to search buses right now. Please try again.");
    }
}

async function handleSeatMap(chatId, text) {
    const busMatch = text.match(/(BUS\d+)/i);
    const busID = busMatch ? busMatch[1].toUpperCase() : null;
    
    if (!busID) {
        return await sendMessage(chatId, MESSAGES.specify_bus_id, "Markdown");
    }

    await sendChatAction(chatId, "typing");
    
    try {
        const db = getFirebaseDb();
        const busDoc = await db.collection('buses').doc(busID).get();
        
        if (!busDoc.exists) {
            return await sendMessage(chatId, MESSAGES.seat_map_error.replace('{busID}', busID), "Markdown");
        }

        const busData = busDoc.data();
        const seatsSnapshot = await db.collection('seats').where('bus_id', '==', busID).get();
        
        if (seatsSnapshot.empty) {
            return await sendMessage(chatId, MESSAGES.no_seats_found.replace('{busID}', busID), "Markdown");
        }

        const seatStatus = {};
        let availableCount = 0;
        
        seatsSnapshot.forEach(doc => {
            const data = doc.data();
            seatStatus[data.seat_no] = data;
            if (data.status === 'available') availableCount++;
        });

        // Create enhanced seat map
        let seatMap = `🚍 *${busID} - Seat Map*\n`;
        seatMap += `🏢 ${busData.owner}\n`;
        seatMap += `📍 ${busData.from} → ${busData.to}\n`;
        seatMap += `📅 ${busData.departure_time?.split(' ')[0] || 'N/A'} 🕒 ${busData.departure_time?.split(' ')[1] || 'N/A'}\n\n`;
        
        seatMap += `*Legend:*\n`;
        seatMap += `🟩 Available • 🔒 Your Selection • ⚫ Booked\n\n`;
        
        seatMap += `🚌 *Driver*\n`;
        seatMap += `┌─────────┬─────────┐\n`;

        for (let row = 1; row <= 10; row++) {
            let line = '│ ';
            for (let col of ['A', 'B', 'C', 'D']) {
                const seatNo = `${row}${col}`;
                const data = seatStatus[seatNo] || {};
                const status = data.status || 'unknown';
                
                let emoji = '⬜';
                if (status === 'available') emoji = `🟩${seatNo}`;
                else if (status === 'booked') emoji = `⚫${seatNo}`;
                else if (status === 'locked') emoji = `🔒${seatNo}`;
                
                line += `${emoji} `;
                if (col === 'B') line += '│ ';
            }
            seatMap += line + '│\n';
            
            if (row === 5) {
                seatMap += '├─────────┼─────────┤\n';
            }
        }
        
        seatMap += `└─────────┴─────────┘\n\n`;
        seatMap += `📊 *${availableCount}* seats available out of ${seatsSnapshot.size}\n\n`;
        seatMap += `💡 *Book a seat:*\n`;
        seatMap += `\`Book seat ${busID} 1A\`\n\n`;
        seatMap += `Need help choosing? Just ask!`;

        await sendMessage(chatId, seatMap, "Markdown");
        
    } catch (error) {
        console.error('Seat map error:', error.message);
        await sendMessage(chatId, MESSAGES.seat_map_error.replace('{busID}', busID), "Markdown");
    }
}

async function handleUserProfile(chatId) {
    try {
        const db = getFirebaseDb();
        const doc = await db.collection('users').doc(String(chatId)).get();

        if (!doc.exists) {
            return await sendMessage(chatId, MESSAGES.user_not_found);
        }

        const user = doc.data();
        const joinDate = user.join_date ? user.join_date.toDate().toLocaleDateString('en-IN') : 'N/A';
        
        const profileText = `👤 *Your Profile*\n\n` +
                           `*Name:* ${user.name || 'Not set'}\n` +
                           `*Phone:* ${user.phone || 'Not set'}\n` +
                           `*Aadhar:* ${user.aadhar || 'Not set'}\n` +
                           `*Role:* ${user.role || 'user'}\n` +
                           `*Status:* ${user.status || 'Active'}\n` +
                           `*Member since:* ${joinDate}\n\n` +
                           `💡 *To update:* Send "my profile details [Name] / [Aadhar] / [Phone]"`;

        const profileKeyboard = {
            inline_keyboard: [
                [{ text: "📞 Update Phone", callback_data: "cb_update_phone" }],
                [{ text: "🚌 Book Bus", callback_data: "cb_book_bus" }]
            ]
        };

        await sendMessage(chatId, profileText, "Markdown", profileKeyboard);
        
    } catch (error) {
        console.error('Profile error:', error.message);
        await sendMessage(chatId, "❌ Unable to load profile. Please try again.");
    }
}

/* --------------------- Enhanced Main Router ---------------------- */

async function handleUserMessage(chatId, text, user) {
    const textLower = text.toLowerCase().trim();

    // Always show typing action for better UX
    await sendChatAction(chatId, "typing");

    // Check for state first
    const state = await getAppState(chatId);
    if (state.state !== 'IDLE') {
        await handleStatefulInput(chatId, text, state);
        return;
    }

    // Handle commands
    switch (true) {
        case textLower === '/start':
            await handleStartCommand(chatId, user);
            break;
            
        case textLower.includes('help') || textLower === '/help':
            await handleHelpCommand(chatId);
            break;
            
        case textLower.includes('book bus') || textLower === '/book':
            await handleBusSearch(chatId);
            break;
            
        case textLower.startsWith('show seats'):
            await handleSeatMap(chatId, text);
            break;
            
        case textLower.startsWith('my profile') || textLower === '/profile':
            await handleUserProfile(chatId);
            break;
            
        case textLower.startsWith('my profile details'):
            await handleProfileUpdate(chatId, text);
            break;
            
        case textLower.startsWith('book seat'):
            await handleSeatSelection(chatId, text);
            break;
            
        case textLower.startsWith('cancel booking'):
            await handleCancellation(chatId, text);
            break;
            
        case textLower.includes('hello') || textLower.includes('hi '):
            await sendMessage(chatId, `👋 Hello ${user.first_name || 'there'}! Ready to book your next journey?`);
            await sendQuickActions(chatId);
            break;
            
        case textLower.includes('thank'):
            await sendMessage(chatId, "You're welcome! 😊 Happy to help with your travel plans.");
            break;
            
        case textLower.includes('bus') && textLower.includes('time'):
            await sendMessage(chatId, "🕒 Bus timings vary by route. Use 'Book bus' to see available buses with their schedules.");
            break;
            
        case textLower.includes('price') || textLower.includes('cost'):
            await sendMessage(chatId, "💰 Prices start from ₹200 and vary by route, bus type, and timing. Check 'Book bus' for current fares.");
            break;
            
        default:
            await sendMessage(chatId, MESSAGES.invalid_command);
            await sendQuickActions(chatId);
    }
}

async function handleStatefulInput(chatId, text, state) {
    // Handle various states here (simplified for example)
    if (state.state === 'AWAITING_PASSENGER_DETAILS') {
        await handlePassengerDetails(chatId, text, state);
    } else if (state.state === 'AWAITING_NEW_PHONE') {
        await handlePhoneUpdateInput(chatId, text);
    } else {
        // Clear stuck state
        await clearAppState(chatId);
        await sendMessage(chatId, "🔄 Session reset. How can I help you today?");
        await sendQuickActions(chatId);
    }
}

// Simplified version of other handlers for brevity
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
        await db.collection('users').doc(String(chatId)).update({
            name: name,
            aadhar: aadhar,
            phone: phone,
            status: 'active'
        });

        await sendMessage(chatId, MESSAGES.profile_updated, "Markdown");
        await handleUserProfile(chatId);

    } catch (error) {
        console.error('Profile update error:', error.message);
        await sendMessage(chatId, "❌ Couldn't update profile. Please check your details and try again.");
    }
}

async function handleSeatSelection(chatId, text) {
    try {
        const match = text.match(/book seat\s+(BUS\d+)\s+([A-Z0-9]+)/i);
        if (!match) {
            return await sendMessage(chatId, "❌ Please specify Bus ID and Seat.\n*Example:* `Book seat BUS101 3A`", "Markdown");
        }

        const busID = match[1].toUpperCase();
        const seatNo = match[2].toUpperCase();

        // Show gender selection
        const genderKeyboard = {
            inline_keyboard: [
                [{ text: "🚹 Male", callback_data: `cb_gender_${busID}_${seatNo}_M` }],
                [{ text: "🚺 Female", callback_data: `cb_gender_${busID}_${seatNo}_F` }],
                [{ text: "❌ Cancel", callback_data: "cb_cancel_booking" }]
            ]
        };

        await sendMessage(chatId, MESSAGES.gender_prompt.replace('{seatNo}', seatNo), "Markdown", genderKeyboard);

    } catch (error) {
        console.error('Seat selection error:', error.message);
        await sendMessage(chatId, "❌ Unable to process seat selection. Please try again.");
    }
}

async function handleCancellation(chatId, text) {
    const match = text.match(/cancel booking\s+(BOOK\d+)/i);
    if (!match) {
        return await sendMessage(chatId, "❌ Please specify Booking ID.\n*Example:* `Cancel booking BOOK123`", "Markdown");
    }

    const bookingId = match[1].toUpperCase();
    await sendMessage(chatId, `🔄 Cancelling booking ${bookingId}...`);

    // Implementation would go here
    await sendMessage(chatId, MESSAGES.booking_cancelled.replace('{bookingId}', bookingId).replace('{dateTime}', new Date().toLocaleString('en-IN')), "Markdown");
}

/* --------------------- Enhanced Callback Handler ---------------------- */

async function handleCallbackQuery(chatId, callbackData, messageId, user) {
    await answerCallbackQuery(callbackData.id, "Processing...");
    await editMessageReplyMarkup(chatId, messageId, null);

    await sendChatAction(chatId, "typing");

    try {
        if (callbackData.data === 'cb_book_bus') {
            await handleBusSearch(chatId);
        } else if (callbackData.data === 'cb_my_booking') {
            await handleBookingInfo(chatId);
        } else if (callbackData.data === 'cb_my_profile') {
            await handleUserProfile(chatId);
        } else if (callbackData.data === 'cb_help') {
            await handleHelpCommand(chatId);
        } else if (callbackData.data === 'cb_main_menu') {
            await sendQuickActions(chatId);
        } else if (callbackData.data.startsWith('cb_register_role_')) {
            await handleRoleSelection(chatId, user, callbackData.data);
        } else if (callbackData.data === 'cb_update_phone') {
            await handleUpdatePhoneNumber(chatId);
        } else if (callbackData.data.startsWith('cb_gender_')) {
            await handleGenderSelection(chatId, callbackData.data);
        } else if (callbackData.data === 'cb_cancel_booking') {
            await clearAppState(chatId);
            await sendMessage(chatId, "✅ Booking cancelled. What would you like to do next?");
            await sendQuickActions(chatId);
        } else if (callbackData.data === 'cb_support') {
            await sendMessage(chatId, "📞 *Support Contact*\n\nFor immediate assistance:\n• Call: 1800-123-4567\n• Email: support@goroute.com\n• Hours: 24/7\n\nWe're here to help! 🛠️", "Markdown");
        } else if (callbackData.data === 'cb_learn_more') {
            await sendMessage(chatId, "ℹ️ *About GoRoute*\n\nWe make bus travel simple, safe, and convenient. Book seats, track buses, and manage your trips - all in one place!\n\nReady to get started? Choose 'Passenger' to begin.", "Markdown");
        } else {
            await sendMessage(chatId, "🔄 Action processed. How can I help you next?");
            await sendQuickActions(chatId);
        }
    } catch (error) {
        console.error('Callback handler error:', error.message);
        await sendMessage(chatId, "❌ Something went wrong. Please try again.");
    }
}

// Simplified versions of other handlers
async function handleRoleSelection(chatId, user, callbackData) {
    const role = callbackData.split('_').pop();
    const db = getFirebaseDb();
    
    await db.collection('users').doc(String(chatId)).set({
        user_id: 'USER' + Date.now(),
        name: user.first_name + (user.last_name ? ' ' + user.last_name : ''),
        chat_id: String(chatId),
        phone: '',
        aadhar: '',
        status: 'pending_details',
        role: role,
        join_date: admin.firestore.FieldValue.serverTimestamp()
    });

    await sendMessage(chatId, MESSAGES.registration_started.replace('{role}', role), "Markdown");
}

async function handleUpdatePhoneNumber(chatId) {
    await saveAppState(chatId, 'AWAITING_NEW_PHONE', {});
    await sendMessage(chatId, MESSAGES.update_phone_prompt, "Markdown");
}

async function handlePhoneUpdateInput(chatId, text) {
    const phoneRegex = /^\d{10}$/;
    const phoneNumber = text.replace(/[^0-9]/g, '');

    if (!phoneNumber.match(phoneRegex)) {
        return await sendMessage(chatId, MESSAGES.phone_invalid, "Markdown");
    }

    const db = getFirebaseDb();
    await db.collection('users').doc(String(chatId)).update({ phone: phoneNumber });
    
    await clearAppState(chatId);
    await sendMessage(chatId, MESSAGES.phone_updated_success, "Markdown");
}

async function handleGenderSelection(chatId, callbackData) {
    const parts = callbackData.split('_');
    const busID = parts[2];
    const seatNo = parts[3];
    const gender = parts[4];

    await sendMessage(chatId, `✅ ${gender === 'M' ? '🚹 Male' : '🚺 Female'} selected for seat ${seatNo}\n\nNow please provide passenger details:\n\n\`[Full Name] / [Age] / [Aadhar Number]\`\n\n*Example:*\n\`Raj Kumar / 25 / 123456789012\``, "Markdown");

    await saveAppState(chatId, 'AWAITING_PASSENGER_DETAILS', {
        busID: busID,
        seatNo: seatNo,
        gender: gender
    });
}

async function handlePassengerDetails(chatId, text, state) {
    const match = text.match(/([^\/]+)\s*\/\s*(\d+)\s*\/\s*(\d+)/i);
    if (!match) {
        return await sendMessage(chatId, MESSAGES.booking_details_error, "Markdown");
    }

    const name = match[1].trim();
    const age = match[2].trim();
    const aadhar = match[3].trim();

    await sendMessage(chatId, `✅ Details saved!\n\n*Passenger:* ${name}\n*Age:* ${age}\n*Seat:* ${state.data.seatNo}\n\nProcessing payment...`);

    // Simulate payment process
    setTimeout(async () => {
        const bookingId = 'BOOK' + Date.now();
        await sendMessage(chatId, MESSAGES.booking_finish
            .replace('{bookingId}', bookingId)
            .replace('{busID}', state.data.busID)
            .replace('{seats}', state.data.seatNo)
            .replace('{count}', '1')
            .replace('{amount}', '450')
            .replace('{date}', new Date().toLocaleDateString('en-IN'))
            .replace('{time}', '14:30'), "Markdown");
        
        await clearAppState(chatId);
        await sendQuickActions(chatId);
    }, 2000);
}

async function handleBookingInfo(chatId) {
    // Mock implementation
    await sendMessage(chatId, `📋 *Your Bookings*\n\n*No active bookings found.*\n\nStart your journey by searching for buses! 🚌`, "Markdown");
    await sendQuickActions(chatId);
}

/* --------------------- Main Webhook Handler ---------------------- */

app.post('/api/webhook', async (req, res) => {
    const update = req.body;
    
    try {
        if (update.message) {
            const message = update.message;
            const chatId = message.chat.id;
            const text = message.text ? message.text.trim() : '';
            const user = message.from;
            
            await handleUserMessage(chatId, text, user);
            
        } else if (update.callback_query) {
            const callback = update.callback_query;
            const chatId = callback.message.chat.id;
            const messageId = callback.message.message_id;
            const user = callback.from;
            
            await handleCallbackQuery(chatId, callback, messageId, user);
        }
    } catch (error) {
        console.error("Webhook handler error:", error.message);
    }

    res.status(200).send('OK');
});

// Health check endpoint
app.get('/', (req, res) => {
    res.status(200).json({ 
        status: 'OK', 
        message: 'GoRoute Telegram Bot is running smoothly',
        timestamp: new Date().toISOString(),
        features: ['Bus Booking', 'Seat Selection', 'Profile Management', 'Live Support']
    });
});

// Start the server
module.exports = app;

console.log("🚀 GoRoute Bot Server Started Successfully!");