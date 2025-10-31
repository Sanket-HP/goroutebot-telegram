// Import the libraries we installed
const express = require('express');
const axios = require('axios');
const admin = require('firebase-admin'); // <-- NEW: Replaces Google Sheets

// Your bot's configuration (keep these secret!)
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN; // This is set in Vercel
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;
// No more SPREADSHEET_ID needed!

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
  
  // --- NEW REGISTRATION MESSAGES ---
  prompt_role: "🎉 *Welcome to GoRoute!* To get started, please choose your role:",
  registration_started: "✅ Great! Your role is set to *{role}*.\n\nTo complete your profile, please provide your details in this format:\n\n`my profile details [Your Full Name] / [Your Aadhar Number]`",
  profile_updated: "✅ *Profile Updated!* Your details have been saved.",
  profile_update_error: "❌ *Error!* Please use the correct format:\n`my profile details [Your Name] / [Your Aadhar]`",
  
  unknown_command: `🤖 Sorry, I didn't understand that.\n\nType /help to see the main menu.`,
  user_not_found: "❌ User not found. Please send /start to register.",
  general_error: "❌ Sorry, I encountered an error. Please try again or type /help.",
  // --- NEW: Database error message ---
  db_error: "❌ CRITICAL ERROR: The bot's database is not connected. Please contact support."
};

// Create the server
const app = express();
app.use(express.json());

// This is your webhook. Telegram will send all updates here.
app.post('/api/webhook', async (req, res) => {
  const update = req.body;
  console.log('Received update:', JSON.stringify(update, null, 2));

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
      const user = callback.from;
      const callbackData = callback.data;
      const messageId = callback.message.message_id;
      
      // Answer the callback immediately
      await answerCallbackQuery(callback.id);
      
      // Remove the inline keyboard (buttons) from the message
      await editMessageReplyMarkup(chatId, messageId, null);

      sendChatAction(chatId, "typing");

      // --- ROUTE CALLBACKS ---
      if (callbackData.startsWith('cb_register_role_')) {
        await handleRoleSelection(chatId, user, callbackData);
      } else if (callbackData === 'cb_book_bus') {
        await handleBusSearch(chatId);
      } else if (callbackData === 'cb_my_booking') {
        await handleBookingInfo(chatId);
      } else if (callbackData === 'cb_my_profile') {
        await handleUserProfile(chatId);
      } else if (callbackData === 'cb_help' || callbackData === 'cb_status') {
        await sendHelpMessage(chatId);
      } else if (callbackData.startsWith('lang_')) {
        await handleSetLanguage(chatId, callbackData.split('_')[1]);
      }
    }
  } catch (error) {
    console.error("Error in main handler:", error.message);
  }

  // Finally, send an "OK" response to Telegram
  res.status(200).send('OK');
});


/* --------------------- Message Router ---------------------- */
async function handleUserMessage(chatId, text, user) {
  console.log(`Routing message: "${text}"`);
  
  const textLower = text.toLowerCase().trim();

  // The /start command now talks to Firebase
  if (textLower === '/start') {
    await startUserRegistration(chatId, user);
    return;
  }

  // Handle /help separately to show the button menu
  if (textLower === 'help' || textLower === '/help') {
    console.log("✅ Handling help command");
    await sendHelpMessage(chatId);
    return;
  }

  // Handle profile details submission
  if (textLower.startsWith('my profile details')) {
    await handleProfileUpdate(chatId, text);
    return;
  }

  // --- All other text commands ---
  const userName = user.first_name || 'User';

  if (textLower === 'book bus' || textLower === '/book') {
    console.log("✅ Handling book bus command");
    await handleBusSearch(chatId);
  }
  else if (textLower.startsWith('show seats')) {
    await handleSeatMap(chatId, text); // This is still mocked (for now)
  }
  else if (textLower.startsWith('book seat')) {
    await handleSeatSelection(chatId, text);
  }
  else if (textLower === '/language' || textLower === 'language') {
    await handleLanguageSelection(chatId);
  }
  else if (textLower === 'status' || textLower === '/status') {
    await handleSystemStatus(chatId);
  }
  else if (textLower === 'my booking' || textLower === 'my tickets') {
    await handleBookingInfo(chatId);
  }
  else if (textLower.startsWith('cancel booking')) {
    await handleCancellation(chatId, text);
  }
  else if (textLower === 'my profile' || textLower === '/profile') {
    await handleUserProfile(chatId); // This is the REAL function
  }
  else if (textLower.startsWith('live tracking')) {
    await handleLiveTracking(chatId, text);
  }
  else if (textLower === 'hello' || textLower === 'hi' || textLower === 'hey') {
    await sendMessage(chatId, `👋 ${userName}!`);
  }
  else { 
    console.log(`🤷 Unknown command: "${text}"`);
    await sendMessage(chatId, MESSAGES.unknown_command);
  }
}

/* --------------------- Specific Command Handlers ---------------------- */

// --- NEW /start FUNCTION (using Firebase) ---
async function startUserRegistration(chatId, user) {
  console.log(`Registering user: ${user.first_name} (${chatId})`);
  
  try {
    const db = getFirebaseDb();
    // 1. Check if user exists in Firebase
    const userRef = db.collection('users').doc(String(chatId));
    const doc = await userRef.get();

    // 2. If user exists, just welcome them
    if (doc.exists) {
      console.log(`User ${chatId} already exists.`);
      await sendMessage(chatId, MESSAGES.welcome_back.replace('{name}', user.first_name || 'User'));
      await sendHelpMessage(chatId); // Show them the main menu
    
    } else {
      // 3. If user is new, ask for their role
      console.log(`New user. Asking for role.`);
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
// --- END OF NEW /start FUNCTION ---

// --- NEW FUNCTION (using Firebase) ---
async function handleRoleSelection(chatId, user, callbackData) {
  const role = callbackData.split('_').pop(); // 'user', 'manager', or 'owner'
  const userName = user.first_name + (user.last_name ? ' ' + user.last_name : '');
  console.log(`Creating new user for ${chatId} with role: ${role}`);

  try {
    const db = getFirebaseDb();
    const userId = 'USER' + Date.now();
    
    // Create new user object
    const newUser = {
      user_id: userId,
      name: userName,
      chat_id: String(chatId),
      phone: '',
      aadhar: '',
      status: 'pending_details',
      role: role,
      lang: 'en',
      join_date: admin.firestore.FieldValue.serverTimestamp() // Use Firebase's timestamp
    };
    
    // Set the document in Firestore using chat_id as the Document ID
    await db.collection('users').doc(String(chatId)).set(newUser);
    
    // Tell user what to do next
    await sendMessage(chatId, MESSAGES.registration_started.replace('{role}', role), "Markdown");
  
  } catch (error) {
    console.error('❌ handleRoleSelection error:', error.message);
    await sendMessage(chatId, MESSAGES.db_error);
  }
}

// --- NEW FUNCTION (using Firebase) ---
async function handleProfileUpdate(chatId, text) {
  try {
    // 1. Parse details from text
    const parts = text.split('details');
    if (parts.length < 2) throw new Error("Invalid format");
    
    const details = parts[1].split('/');
    if (details.length < 2) throw new Error("Invalid format");

    const name = details[0].trim();
    const aadhar = details[1].trim();

    if (!name || !aadhar) throw new Error("Invalid format");

    // 2. Find user in DB
    const db = getFirebaseDb();
    const userRef = db.collection('users').doc(String(chatId));
    const doc = await userRef.get();

    if (!doc.exists) {
      await sendMessage(chatId, MESSAGES.user_not_found);
      return;
    }
    
    // 3. Update the DB
    await userRef.update({
      name: name,
      aadhar: aadhar,
      status: 'active'
    });

    await sendMessage(chatId, MESSAGES.profile_updated, "Markdown");
    await handleUserProfile(chatId); // Show them their updated profile

  } catch (error) {
    if (error.message === "Invalid format") {
      await sendMessage(chatId, MESSAGES.profile_update_error, "Markdown");
    } else {
      console.error('❌ handleProfileUpdate error:', error.message);
      await sendMessage(chatId, MESSAGES.db_error);
    }
  }
}

// This function is FAST (sends a keyboard).
async function handleLanguageSelection(chatId) {
  const keyboard = {
    inline_keyboard: [
      [
        { text: "🇺🇸 English", callback_data: "lang_en" }
      ]
    ]
  };
  await sendMessage(chatId, "🌐 *Choose your language*", "Markdown", keyboard);
}

// This function is FAST (WIP).
async function handleSetLanguage(chatId, language) {
  await sendMessage(chatId, MESSAGES.feature_wip);
}

// --- NEW: SENDS BUTTON MENU ---
async function sendHelpMessage(chatId) {
  // TODO: Add role-based menus
  // const user = await findUser(chatId);
  // if (user.role === 'manager') { ... }
  const keyboard = {
    inline_keyboard: [
      [
        { text: "🚌 Book a Bus", callback_data: "cb_book_bus" }
      ],
      [
        { text: "🎫 My Bookings", callback_data: "cb_my_booking" },
        { text: "👤 My Profile", callback_data: "cb_my_profile" }
      ],
      [
        { text: "ℹ️ Help / Status", callback_data: "cb_status" }
      ]
    ]
  };
  await sendMessage(chatId, MESSAGES.help, "Markdown", keyboard);
}

// This function is FAST (WIP).
async function handleSystemStatus(chatId) {
  await sendMessage(chatId, MESSAGES.feature_wip);
}

// This function is FAST (mocked for now).
async function handleBusSearch(chatId) {
  try {
    console.log("🔄 Starting bus search (Mocked)...");
    const buses = getAvailableBuses(); // Mocked data
    
    // TODO: This function should be made REAL
    // 1. Create a 'buses' collection in Firebase
    // 2. Read from it: const snapshot = await db.collection('buses').get();
    
    if (!buses || buses.length === 0) {
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
    
    response += `💡 *Quick actions:*\n`;
    response += `• "Show seats BUS101" - View seat map\n`;
    response += `• "Book seat BUS101 3A" - Book specific seat`;
    
    await sendMessage(chatId, response, "Markdown");
    console.log("✅ Bus search completed successfully");
    
  } catch (error) {
    console.error('❌ Bus search error:', error.message);
  }
}

// --- THIS IS MOCKED (for now) ---
async function handleSeatMap(chatId, text) {
  try {
    const busMatch = text.match(/(BUS\d+)/i);
    const busID = busMatch ? busMatch[1].toUpperCase() : null;
    
    if (!busID) {
      await sendMessage(chatId, MESSAGES.specify_bus_id, "Markdown");
      return;
    }
    
    // TODO: This function should be made REAL
    // 1. Create a 'seats' collection in Firebase
    // 2. Read from it: const snapshot = await db.collection('seats').where('bus_id', '==', busID).get();
    
    console.log(`Fetching MOCKED seat map for ${busID}`);
    const busInfo = getBusInfo(busID) || { from: 'N/A', to: 'N/A', date: 'N/A', time: 'N/A' };

    let seatMap = `🚍 *Seat Map - ${busID}*\n`;
    seatMap += `📍 ${busInfo.from} → ${busInfo.to}\n`;
    seatMap += `🕒 ${busInfo.date} ${busInfo.time}\n\n`;
    seatMap += `Legend: 🟩 Available • ⚫ Booked\n\n`;

    // Static mocked map
    for (let row = 1; row <= 10; row++) {
      let line = '';
      for (let col of ['A', 'B', 'C', 'D']) {
        const seatNo = `${row}${col}`;
        let status = '🟩'; // Available
        if (seatNo === '3A' || seatNo === '5B' || seatNo === '3D') {
          status = '⚫'; // Booked
        }
        
        line += `${status} ${seatNo} `;
        if (col === 'B') {
          line += `    🚌    `; // Aisle
        }
      }
      seatMap += line + '\n';
    }
    
    seatMap += `\n📊 *37* seats available / 40\n\n`; // Mocked
    seatMap += `💡 *Book a seat:* "Book seat ${busID} SEAT_NUMBER"\n`;
    seatMap += ` Example: "Book seat ${busID} 1A"`;

    await sendMessage(chatId, seatMap, "Markdown");
    
  } catch (error) {
    console.error('❌ Seat map error:', error.message);
    await sendMessage(chatId, MESSAGES.general_error);
  }
}
// --- END OF MOCKED FUNCTION ---

async function handleSeatSelection(chatId, text) {
  // This is the next major function to build.
  // It will require state management (e.g., asking for passenger name, aadhar, etc.)
  await sendMessage(chatId, MESSAGES.feature_wip, "Markdown");
}

async function handleBookingInfo(chatId) {
  // TODO: Read 'bookings' collection and filter by chat_id
  await sendMessage(chatId, MESSAGES.feature_wip, "Markdown");
}

async function handleCancellation(chatId, text) {
  // TODO:
  // 1. Parse BookingID
  // 2. Find booking in 'bookings' collection, verify chat_id
  // 3. Update 'bookings' status to 'cancelled'
  // 4. Find seat in 'seats' collection, update status to 'available'
  await sendMessage(chatId, MESSAGES.feature_wip, "Markdown");
}


// --- THIS IS THE NEW, REAL "My Profile" FUNCTION (using Firebase) ---
async function handleUserProfile(chatId) {
  console.log(`Fetching profile for ${chatId}`);
  try {
    const db = getFirebaseDb();
    const userRef = db.collection('users').doc(String(chatId));
    const doc = await userRef.get();

    if (doc.exists) {
      // Found the user!
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
      
      if (user.status === 'pending_details') {
         await sendMessage(chatId, "Please complete your profile by typing:\n`my profile details [Name] / [Aadhar]`", "Markdown");
      }

    } else {
      // User not found in the sheet
      await sendMessage(chatId, MESSAGES.user_not_found);
    }

  } catch (error) {
    console.error('❌ Error in handleUserProfile:', error.message);
    await sendMessage(chatId, MESSAGES.db_error);
  }
}
// --- END OF UPDATED FUNCTION ---

async function handleLiveTracking(chatId, text) {
  await sendMessage(chatId, MESSAGES.feature_wip, "Markdown");
}

/* --------------------- Mock Data Functions (Still Used) ---------------------- */

function getAvailableBuses() {
  // This is still mocked.
  console.log("Building NEW buses list from SAMPLE data (Fast Path)");
  return [
    {
      busID: "BUS101",
      from: "Mumbai",
      to: "Pune",
      date: "2024-03-20",
      time: "08:00",
      owner: "Sharma Travels",
      price: 450,
      busType: "AC Sleeper",
      rating: 4.2,
      availableSeats: 15 // This is mocked
    },
    {
      busID: "BUS102", 
      from: "Pune",
      to: "Mumbai",
      date: "2024-03-20",
      time: "10:30",
      owner: "Patel Bus Service",
      price: 380,
      busType: "Non-AC Seater",
      rating: 4.0,
      availableSeats: 8 // This is mocked
    }
  ];
}

function getBusInfo(busID) {
  // This is still mocked.
  if(!busID) return null;
  const allBuses = getAvailableBuses();
  const bus = allBuses.find(b => b.busID === busID);
  
  if (bus) {
    return {
      busID: bus.busID,
      from: bus.from,
      to: bus.to,
      date: bus.date,
      time: bus.time,
      price: bus.price
    };
  }
  return null; // Bus not found
}

/* --------------------- NEW Firebase Helper ---------------------- */

let db; // Create a cached instance of the database

/**
 * Initializes and/or returns the Firebase Firestore database instance.
 * This is a robust function that handles the Vercel environment.
 */
function getFirebaseDb() {
  // If we already initialized, return the cached instance
  if (db) {
    return db;
  }

  try {
    // Check if Firebase app is already initialized
    if (admin.apps.length > 0) {
      db = admin.firestore();
      return db;
    }
    
    // Get the raw, single-line JSON string from Vercel
    const rawCreds = process.env.FIREBASE_CREDS;
    if (!rawCreds) {
      throw new Error("CRITICAL: FIREBASE_CREDS is not defined in Vercel Environment Variables.");
    }
    
    // Parse the JSON string
    const serviceAccount = JSON.parse(rawCreds.replace(/\\n/g, '\n'));

    // Initialize the Firebase Admin SDK
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    
    // Get the Firestore database instance
    db = admin.firestore();
    console.log("Firebase initialized successfully!");
    return db;

  } catch (e) {
    console.error("CRITICAL FIREBASE ERROR", e.message);
    // This will be caught by the calling functions
    throw e; 
  }
}


/* --------------------- Helper Functions (axios) ---------------------- */

// Helper function to send a message
async function sendMessage(chatId, text, parseMode = null, replyMarkup = null) {
  console.log(`Sending message to ${chatId}`);
  try {
    const payload = {
      chat_id: chatId,
      text: text,
    };
    if (parseMode) {
      payload.parse_mode = parseMode;
    }
    if (replyMarkup) {
      payload.reply_markup = replyMarkup;
    }
    await axios.post(`${TELEGRAM_API}/sendMessage`, payload);
  } catch (error) {
    console.error('Error sending message:', error.response ? error.response.data : error.message);
  }
}

// Helper function to send "typing..."
async function sendChatAction(chatId, action) {
  try {
    await axios.post(`${TELEGRAM_API}/sendChatAction`, {
      chat_id: chatId,
      action: action,
    });
  } catch (error) {
    console.error('Error sending chat action:', error.response ? error.response.data : error.message);
  }
}

// Helper function to answer callbacks
async function answerCallbackQuery(callbackQueryId) {
  try {
    await axios.post(`${TELEGRAM_API}/answerCallbackQuery`, {
      callback_query_id: callbackQueryId,
    });
  } catch (error) {
    console.error('Error answering callback:', error.response ? error.response.data : error.message);
  }
}

// --- NEW HELPER: editMessageReplyMarkup ---
// This is used to remove the inline keyboard after a button is clicked
async function editMessageReplyMarkup(chatId, messageId, replyMarkup) {
  try {
    await axios.post(`${TELEGRAM_API}/editMessageReplyMarkup`, {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: replyMarkup // Pass null to remove
    });
  } catch (error) {
    // Don't log "message is not modified" errors, they are normal
    if (!error.response || !error.response.data || !error.response.data.description.includes("message is not modified")) {
       console.error('Error editing message markup:', error.response ? error.response.data : error.message);
    }
  }
}

// Start the server
module.exports = app;

