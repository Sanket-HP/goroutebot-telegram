// Import the libraries we installed
const express = require('express');
const axios = require('axios');
const { google } = require('googleapis'); // <-- We need this

// Your bot's configuration (keep these secret!)
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN; // This is set in Vercel
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;

// --- Google Sheets Config ---
const SPREADSHEET_ID = "1784I1ppOyNHgYc98ZKxKOBU3RFWjNwpgiI5dJWQD8Ro"; // Your Sheet ID
// This line will crash if GOOGLE_SHEETS_CREDS is not in Vercel!
const GOOGLE_SHEETS_CREDS = JSON.parse(process.env.GOOGLE_SHEETS_CREDS);
// --- END Config ---

// --- MESSAGES ---
const MESSAGES = {
  // Updated help message for the new button menu
  help: `🆘 *GoRoute Help Center*

Select an option from the menu below to get started. You can also type commands like "book bus".`,
  no_buses: "❌ *No buses available matching your criteria.*\n\nPlease check back later or try different routes.",
  specify_bus_id: '❌ Please specify the Bus ID.\nExample: "Show seats BUS101"',
  seat_map_error: '❌ Error generating seat map for {busID}.',
  no_seats_found: '❌ No seats found in the system for bus {busID}.',
  feature_wip: '🚧 This feature is coming soon!',
  welcome_back: '👋 Welcome back, {name}!',
  registration_success: '🎉 Welcome to GoRoute, {name}! Your account is created. Type "book bus" to start.',
  unknown_command: `🤖 Sorry, I didn't understand that.\n\nType /help to see the main menu.`,
  user_not_found: "❌ User not found. Please send /start to register.",
  general_error: "❌ Sorry, I encountered an error. Please try again or type /help."
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
      // --- NEW: Handle button clicks ---
      const callback = update.callback_query;
      const chatId = callback.message.chat.id;
      const user = callback.from;
      const callbackData = callback.data;
      
      // 1. Answer the callback immediately
      await answerCallbackQuery(callback.id);
      // 2. Show "typing..."
      sendChatAction(chatId, "typing");

      // 3. Route the button click
      if (callbackData === 'cb_book_bus') {
        await handleBusSearch(chatId);
      } else if (callbackData === 'cb_my_booking') {
        await handleBookingInfo(chatId);
      } else if (callbackData === 'cb_my_profile') {
        await handleUserProfile(chatId);
      } else if (callbackData === 'cb_help') {
        // Re-send the help menu
        await sendHelpMessage(chatId);
      } else if (callbackData.startsWith('lang_')) {
        await handleSetLanguage(chatId, callbackData.split('_')[1]);
      }
      // --- END NEW ---
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

  // The /start command is now a REAL, (slower) database function.
  if (textLower === '/start') {
    await startUserRegistration(chatId, user); // Pass the full user object
    return; // Stop processing
  }

  // Handle /help separately to show the button menu
  if (textLower === 'help' || textLower === '/help') {
    console.log("✅ Handling help command");
    await sendHelpMessage(chatId);
    return;
  }

  // --- All other text commands ---
  const userName = user.first_name || 'User';

  if (textLower === 'book bus' || textLower === '/book') {
    console.log("✅ Handling book bus command");
    await handleBusSearch(chatId);
  }
  else if (textLower.startsWith('show seats')) {
    await handleSeatMap(chatId, text); // This is now a REAL function
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

// --- THIS IS THE NEW, REAL /start FUNCTION ---
async function startUserRegistration(chatId, user) {
  const userName = user.first_name + (user.last_name ? ' ' + user.last_name : '');
  // Note: Telegram does not provide phone number by default.
  // The user must click a "Share Phone" button, which we can add later.
  const userPhone = ''; 
  console.log(`Registering user: ${userName} (${chatId})`);
  
  try {
    const sheets = await getGoogleSheetsClient();
    
    // 1. Check if user exists
    const getRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Users!C:C', // Only check the ChatID column
    });

    const chatIds = getRes.data.values;
    let userFound = false;
    if (chatIds) {
      // .some checks if any row in the array meets the condition
      userFound = chatIds.some(row => row[0] === String(chatId));
    }

    // 2. If user exists, just welcome them
    if (userFound) {
      console.log(`User ${chatId} already exists.`);
      await sendMessage(chatId, MESSAGES.welcome_back.replace('{name}', user.first_name || 'User'));
    
    } else {
      // 3. If user is new, add them to the sheet
      console.log(`Creating new user for ${chatId}`);
      const userId = 'USER' + Date.now();
      const joinDate = new Date().toISOString();
      // Schema: UserID, Name, ChatID, Phone, Status, JoinDate, Role, Lang
      const newRow = [
        userId,         // A: UserID
        userName,       // B: Name
        String(chatId), // C: ChatID
        userPhone,      // D: Phone
        'active',       // E: Status
        joinDate,       // F: JoinDate
        'user',         // G: Role (default)
        'en'            // H: Lang (default)
      ];
      
      await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: 'Users!A1',
        valueInputOption: 'USER_ENTERED',
        resource: {
          values: [newRow],
        },
      });
      
      await sendMessage(chatId, MESSAGES.registration_success.replace('{name}', user.first_name || 'User'));
    }
    
    // 4. Always send help menu with buttons
    await sendHelpMessage(chatId);

  } catch (error) {
    console.error('❌ Registration error:', error.message);
    if (error.message.includes("key")) {
       await sendMessage(chatId, "❌ CRITICAL ERROR: The bot's server is not configured correctly (missing API key). Please contact support.");
    } else if (error.message.includes("permission")) {
       await sendMessage(chatId, "❌ CRITICAL ERROR: The bot does not have permission to access the database. Please contact support.");
    } else {
       await sendMessage(chatId, "❌ Sorry, I encountered an error during registration.");
    }
  }
}
// --- END OF NEW /start FUNCTION ---

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
// --- END NEW ---

// This function is FAST (WIP).
async function handleSystemStatus(chatId) {
  await sendMessage(chatId, MESSAGES.feature_wip);
}

// This function is FAST (mocked for now).
async function handleBusSearch(chatId) {
  try {
    console.log("🔄 Starting bus search (Mocked)...");
    const buses = getAvailableBuses(); // Mocked data
    
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

// --- THIS IS THE NEW, REAL "Show Seats" FUNCTION ---
async function handleSeatMap(chatId, text) {
  try {
    const busMatch = text.match(/(BUS\d+)/i);
    const busID = busMatch ? busMatch[1].toUpperCase() : null;
    
    if (!busID) {
      await sendMessage(chatId, MESSAGES.specify_bus_id, "Markdown");
      return;
    }
    
    console.log(`Fetching REAL seat map for ${busID}`);
    const sheets = await getGoogleSheetsClient();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Seats!A:F', // Schema: A:BusID, B:SeatNo, F:Status
    });

    const allSeats = response.data.values;
    if (!allSeats) {
      await sendMessage(chatId, MESSAGES.seat_map_error.replace('{busID}', busID), "Markdown");
      return;
    }

    // Filter seats for the requested bus
    const busSeats = allSeats.filter(row => row[0] === busID);
    if (busSeats.length === 0) {
      await sendMessage(chatId, MESSAGES.no_seats_found.replace('{busID}', busID), "Markdown");
      return;
    }

    // Get mocked bus info for header (From, To, Time)
    const busInfo = getBusInfo(busID) || { from: 'N/A', to: 'N/A', date: 'N/A', time: 'N/A' };

    let seatMap = `🚍 *Seat Map - ${busID}*\n`;
    seatMap += `📍 ${busInfo.from} → ${busInfo.to}\n`;
    seatMap += `🕒 ${busInfo.date} ${busInfo.time}\n\n`;
    seatMap += `Legend: 🟩 Available • ⚫ Booked\n\n`;

    // Build a dictionary for fast lookup
    let availableCount = 0;
    const seatStatus = {};
    busSeats.forEach(row => {
      const seatNo = row[1]; // e.g., "1A"
      const status = row[5]; // e.g., "available"
      seatStatus[seatNo] = status;
      if (status === 'available') availableCount++;
    });

    // Loop and build the visual map
    // This assumes a 10-row, 4-col (A,B,C,D) layout
    for (let row = 1; row <= 10; row++) {
      let line = '';
      for (let col of ['A', 'B', 'C', 'D']) {
        const seatNo = `${row}${col}`;
        const status = seatStatus[seatNo];
        
        if (status === 'available') {
          line += '🟩'; // Available
        } else if (status === 'booked' || status === 'locked') {
          line += '⚫'; // Booked
        } else {
          line += '⬜️'; // Not found in sheet
        }
        
        if (col === 'B') {
          line += ` ${seatNo}     🚌    `; // Aisle
        } else {
          line += ` ${seatNo} `;
        }
      }
      seatMap += line + '\n';
    }
    
    seatMap += `\n📊 *${availableCount}* seats available / ${busSeats.length}\n\n`;
    seatMap += `💡 *Book a seat:* "Book seat ${busID} SEAT_NUMBER"\n`;
    seatMap += ` Example: "Book seat ${busID} 1A"`;

    await sendMessage(chatId, seatMap, "Markdown");
    
  } catch (error) {
    console.error('❌ Seat map error:', error.message);
    await sendMessage(chatId, MESSAGES.seat_map_error.replace('{busID}', 'specified bus'), "Markdown");
  }
}
// --- END OF REAL FUNCTION ---

async function handleSeatSelection(chatId, text) {
  await sendMessage(chatId, MESSAGES.feature_wip, "Markdown");
}

async function handleBookingInfo(chatId) {
  await sendMessage(chatId, MESSAGES.feature_wip, "Markdown");
}

async function handleCancellation(chatId, text) {
  await sendMessage(chatId, MESSAGES.feature_wip, "Markdown");
}


// --- THIS IS THE UPDATED "My Profile" FUNCTION ---
async function handleUserProfile(chatId) {
  console.log(`Fetching profile for ${chatId}`);
  try {
    const sheets = await getGoogleSheetsClient();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Users!A:H', // Schema: A:UserID, B:Name, C:ChatID, D:Phone, E:Status, F:JoinDate, G:Role, H:Lang
    });

    const rows = response.data.values;
    if (!rows || rows.length === 0) {
      await sendMessage(chatId, "Error: Could not find any users.");
      return;
    }

    // Find the user with a matching ChatID in Column C (index 2)
    const userRow = rows.find(row => row[2] && row[2] === String(chatId));

    if (userRow) {
      // Found the user!
      const profile = {
        name: userRow[1] || 'N/A',
        userId: userRow[0] || 'N/A',
        chatId: userRow[2],
        phone: userRow[3] || 'Not set', // Added Phone
        status: userRow[4] || 'N/A',
        joinDate: userRow[5] ? new Date(userRow[5]).toLocaleDateString('en-IN') : 'N/A',
        role: userRow[6] || 'user',
        language: userRow[7] || 'en'
      };
      
      let profileText = `👤 *Your Profile*\n\n`;
      profileText += `*Name:* ${profile.name}\n`;
      profileText += `*Chat ID:* ${profile.chatId}\n`;
      profileText += `*Phone:* ${profile.phone}\n`;
      profileText += `*Role:* ${profile.role}\n`;
      profileText += `*Status:* ${profile.status}\n`;
      profileText += `*Member since:* ${profile.joinDate}`;
      
      await sendMessage(chatId, profileText, "Markdown");

    } else {
      // User not found in the sheet
      await sendMessage(chatId, MESSAGES.user_not_found);
    }

  } catch (error) {
    console.error('❌ Error in handleUserProfile:', error.message);
    if (error.message.includes("key")) {
       await sendMessage(chatId, "❌ CRITICAL ERROR: The bot's server is not configured correctly (missing API key). Please contact support.");
    } else if (error.message.includes("permission")) {
       await sendMessage(chatId, "❌ CRITICAL ERROR: The bot does not have permission to access the database. Please contact support.");
    } else {
      await sendMessage(chatId, MESSAGES.general_error);
    }
  }
}
// --- END OF UPDATED FUNCTION ---

async function handleLiveTracking(chatId, text) {
  await sendMessage(chatId, MESSAGES.feature_wip, "Markdown");
}

/* --------------------- Mock Data Functions (Still Used) ---------------------- */

function getAvailableBuses() {
  // This is still mocked.
  // TODO: Read this from 'Buses' sheet just like we read from 'Seats'.
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

/* --------------------- Google Sheets Helper ---------------------- */

async function getGoogleSheetsClient() {
  // This function uses the GOOGLE_SHEETS_CREDS from Vercel
  const auth = new google.auth.JWT(
    GOOGLE_SHEETS_CREDS.client_email,
    null,
    GOOGLE_SHEETS_CREDS.private_key,
    ['https://www.googleapis.com/auth/spreadsheets']
  );

  // Make sure the client is authenticated
  await auth.authorize();
  
  const sheets = google.sheets({ version: 'v4', auth });
  return sheets;
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
    // --- BUG FIX: Was TELEGETELEGRAM_API ---
    await axios.post(`${TELEGRAM_API}/answerCallbackQuery`, {
      callback_query_id: callbackQueryId,
    });
  } catch (error) {
    console.error('Error answering callback:', error.response ? error.response.data : error.message);
  }
}

// Start the server
module.exports = app;

