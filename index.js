// Import the libraries we installed
const express = require('express');
const axios = require('axios');
const { google } = require('googleapis'); // <-- We need this

// Your bot's configuration (keep these secret!)
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN; // This is set in Vercel
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;

// --- Google Sheets Config ---
const SPREADSHEET_ID = "1784I1ppOyNHgYc98ZKxKOBU3RFWjNwpgiI5dJWQD8Ro"; // Your Sheet ID
// We will now load and parse GOOGLE_SHEETS_CREDS inside the helper function
// --- END Config ---

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
  registration_started: "✅ Great! Your role is set to *{role}*.\n\nTo complete your profile, please provide your details in this format:\n\n`my profile details [Your Full Name] / [Your Aadhar Number]`\n\n(Don't worry, this is just an example for now!)",
  profile_updated: "✅ *Profile Updated!* Your details have been saved.",
  profile_update_error: "❌ *Error!* Please use the correct format:\n`my profile details [Your Name] / [Your Aadhar]`",
  
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

  // --- NEW: Handle profile details submission ---
  if (textLower.startsWith('my profile details')) {
    await handleProfileUpdate(chatId, text);
    return;
  }
  // --- END NEW ---

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
  console.log(`Registering user: ${user.first_name} (${chatId})`);
  
  try {
    // 1. Check if user exists
    const userRow = await findUserRow(chatId);

    // 2. If user exists, just welcome them
    if (userRow) {
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
    await handleSheetError(error, chatId);
  }
}
// --- END OF NEW /start FUNCTION ---

// --- NEW FUNCTION: Handles the role button click ---
async function handleRoleSelection(chatId, user, callbackData) {
  const role = callbackData.split('_').pop(); // 'user', 'manager', or 'owner'
  const userName = user.first_name + (user.last_name ? ' ' + user.last_name : '');
  console.log(`Creating new user for ${chatId} with role: ${role}`);

  try {
    const sheets = await getGoogleSheetsClient();
    const userId = 'USER' + Date.now();
    const joinDate = new Date().toISOString();
    // Schema: A: UserID, B: Name, C: ChatID, D: Phone, E: Aadhar, F: Status, G: Role, H: Lang, I: JoinDate
    const newRow = [
      userId,         // A: UserID
      userName,       // B: Name
      String(chatId), // C: ChatID
      '',             // D: Phone
      '',             // E: Aadhar
      'pending_details', // F: Status
      role,           // G: Role
      'en',           // H: Lang (default)
      joinDate        // I: JoinDate
    ];
    
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Users!A1',
      valueInputOption: 'USER_ENTERED',
      resource: {
        values: [newRow],
      },
    });
    
    // Tell user what to do next
    await sendMessage(chatId, MESSAGES.registration_started.replace('{role}', role), "Markdown");
  
  } catch (error) {
    console.error('❌ handleRoleSelection error:', error.message);
    await handleSheetError(error, chatId);
  }
}

// --- NEW FUNCTION: Handles the "my profile details" command ---
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

    // 2. Find user's row in sheet
    const userRow = await findUserRow(chatId);
    if (!userRow) {
      await sendMessage(chatId, MESSAGES.user_not_found);
      return;
    }
    
    // 3. Update the sheet
    const sheets = await getGoogleSheetsClient();
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      resource: {
        valueInputOption: 'USER_ENTERED',
        data: [
          {
            range: `Users!B${userRow.rowIndex}`, // Column B = Name
            values: [[name]]
          },
          {
            range: `Users!E${userRow.rowIndex}`, // Column E = Aadhar
            values: [[aadhar]]
          },
          {
            range: `Users!F${userRow.rowIndex}`, // Column F = Status
            values: [['active']]
          }
        ]
      }
    });

    await sendMessage(chatId, MESSAGES.profile_updated, "Markdown");
    await handleUserProfile(chatId); // Show them their updated profile

  } catch (error) {
    if (error.message === "Invalid format") {
      await sendMessage(chatId, MESSAGES.profile_update_error, "Markdown");
    } else {
      console.error('❌ handleProfileUpdate error:', error.message);
      await handleSheetError(error, chatId);
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
    // 1. Get GoogleSheetsClient
    // 2. Read from 'Buses' sheet
    // 3. Loop and build a list of bus objects
    
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
      range: 'Seats!A:F', // Schema: A:BusID, B:SeatNo ... F:Status
    });

    const allSeats = response.data.values;
    if (!allSeats) {
      await sendMessage(chatId, MESSAGES.seat_map_error.replace('{busID}', busID), "Markdown");
      return;
    }

    // Filter seats for the requested bus
    const busSeats = allSeats.filter(row => row && row[0] === busID);
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
    await handleSheetError(error, chatId);
  }
}
// --- END OF REAL FUNCTION ---

async function handleSeatSelection(chatId, text) {
  // This is the next major function to build.
  // It will require state management.
  await sendMessage(chatId, MESSAGES.feature_wip, "Markdown");
}

async function handleBookingInfo(chatId) {
  // TODO: Read 'Bookings' sheet and filter by ChatID
  await sendMessage(chatId, MESSAGES.feature_wip, "Markdown");
}

async function handleCancellation(chatId, text) {
  // TODO:
  // 1. Parse BookingID from text
  // 2. Find booking in 'Bookings' sheet, verify ChatID
  // 3. Update 'Bookings' status to 'cancelled'
  // 4. Find seat in 'Seats' sheet, update status to 'available'
  await sendMessage(chatId, MESSAGES.feature_wip, "Markdown");
}


// --- THIS IS THE UPDATED "My Profile" FUNCTION ---
async function handleUserProfile(chatId) {
  console.log(`Fetching profile for ${chatId}`);
  try {
    const userRow = await findUserRow(chatId);

    if (userRow) {
      // Found the user!
      // Schema: A:UserID, B:Name, C:ChatID, D:Phone, E:Aadhar, F:Status, G:Role, H:Lang, I:JoinDate
      const rowData = userRow.row;
      
      const profileText = `👤 *Your Profile*\n\n` +
                          `*Name:* ${rowData[1] || 'Not set'}\n` +
                          `*Chat ID:* ${rowData[2]}\n` +
                          `*Phone:* ${rowData[3] || 'Not set'}\n` +
                          `*Aadhar:* ${rowData[4] || 'Not set'}\n` +
                          `*Role:* ${rowData[6] || 'user'}\n` +
                          `*Status:* ${rowData[5] || 'N/A'}\n` +
                          `*Member since:* ${rowData[8] ? new Date(rowData[8]).toLocaleDateString('en-IN') : 'N/A'}`;
      
      await sendMessage(chatId, profileText, "Markdown");
      
      if (rowData[5] === 'pending_details') {
         await sendMessage(chatId, "Please complete your profile by typing:\n`my profile details [Name] / [Aadhar]`", "Markdown");
      }

    } else {
      // User not found in the sheet
      await sendMessage(chatId, MESSAGES.user_not_found);
    }

  } catch (error) {
    console.error('❌ Error in handleUserProfile:', error.message);
    await handleSheetError(error, chatId);
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

// --- NEW HELPER: findUserRow ---
/**
 * Finds a user's full row and row index by their ChatID.
 * @param {string} chatId The user's Telegram Chat ID
 * @returns {object | null} { row, rowIndex } or null if not found
 */
async function findUserRow(chatId) {
  const sheets = await getGoogleSheetsClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: 'Users!A:I', // Get all user data
  });

  const rows = response.data.values;
  if (!rows || rows.length === 0) {
    console.log("No users found in sheet.");
    return null;
  }

  // Find the user with a matching ChatID in Column C (index 2)
  // Skip header row (index 0)
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    // Check if Column C (ChatID) matches
    if (row && row[2] && row[2] === String(chatId)) {
      return {
        row: row,
        rowIndex: i + 1 // 1-based index for sheet ranges
      };
    }
  }
  
  console.log(`User ${chatId} not found in sheet.`);
  return null; // User not found
}
// --- END NEW HELPER ---

// --- THIS IS THE FINAL, ROBUST VERSION ---
async function getGoogleSheetsClient() {
  // 1. Get the raw string from Vercel
  const rawCreds = process.env.GOOGLE_SHEETS_CREDS;
  if (!rawCreds) {
    throw new Error("CRITICAL: GOOGLE_SHEETS_CREDS is not defined. Check Vercel Environment Variables.");
  }

  let creds;
  try {
    // 2. Parse it
    creds = JSON.parse(rawCreds);
  } catch (e) {
    console.error("CRITICAL ERROR: GOOGLE_SHEETS_CREDS is not valid JSON.", e.message);
    throw new Error("CRITICAL: GOOGLE_SHEETS_CREDS is not valid JSON.");
  }
  
  // 3. Fix the private key (the \n bug)
  const privateKey = creds.private_key.replace(/\\n/g, '\n');
  
  // 4. Authenticate
  const auth = new google.auth.JWT(
    creds.client_email,
    null,
    privateKey,
    ['https://www.googleapis.com/auth/spreadsheets']
  );
  
  await auth.authorize();
  const sheets = google.sheets({ version: 'v4', auth });
  return sheets;
}
// --- END FINAL VERSION ---


// --- NEW HELPER: handleSheetError ---
async function handleSheetError(error, chatId) {
  console.error('❌ Google Sheet Error:', error.message);
  // Log the specific Google API error if available
  if (error.errors) {
    console.error('Google API Errors:', JSON.stringify(error.errors, null, 2));
  }
  
  if (error.message.includes("key") || error.message.includes("CRITICAL")) {
     await sendMessage(chatId, "❌ CRITICAL ERROR: The bot's server is not configured correctly. Please contact support.");
  } else if (error.message.includes("permission") || error.message.includes("denied")) {
     await sendMessage(chatId, "❌ CRITICAL ERROR: The bot does not have permission to access the database. Please contact support.");
  } else {
    await sendMessage(chatId, MESSAGES.general_error);
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

// --- SCHEMA REMINDER FOR YOUR "Users" SHEET ---
// Col A: UserID
// Col B: Name
// Col C: ChatID
// Col D: Phone
// Col E: Aadhar
// Col F: Status (e.g., "active", "pending_details")
// Col G: Role (e.g., "user", "manager", "owner")
// Col H: Lang
// Col I: JoinDate

