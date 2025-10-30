// Import the libraries we installed
const express = require('express');
const axios = require('axios');

// Your bot's configuration (keep these secret!)
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN; // This is set in Vercel
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;

// --- MESSAGES ---
// Translated from your Apps Script MESSAGES object
const MESSAGES = {
  help: `🆘 *GoRoute Help Center*

*Booking Commands:*
• *Book bus* - Start bus search
• *Show seats BUS101* - View seat map
• *Book seat BUS101 3A* - Book specific seat
• *My booking* - View your tickets
• *Cancel booking BOOK123* - Cancel booking

*Information Commands:*
• *My profile* - Your account details
• *Live tracking BUS101* - Track bus location
• *Status* - System status
• */language* - Change language

💡 *Quick start:* Type "Book bus" to begin your journey!`,
  no_buses: "❌ *No buses available matching your criteria.*\n\nPlease check back later or try different routes.",
  specify_bus_id: '❌ Please specify the Bus ID.\nExample: "Show seats BUS101"',
  seat_map_error: '❌ Error generating seat map for {busID}.',
  feature_wip: '🚧 This feature is coming soon!',
  welcome_back: '👋 Welcome back, {name}! Type "help" to see available commands.',
  unknown_command: `🤖 Sorry, I didn't understand that.\n\nTry:\n"book bus"\n"my booking"\n"help"`,
};

// Create the server
const app = express();
// This line is important! It parses the JSON data from Telegram
app.use(express.json());

// This is your webhook. Telegram will send all updates here.
app.post('/api/webhook', async (req, res) => {
  const update = req.body;
  
  // Log the incoming message (you can check this in the Vercel logs)
  console.log('Received update:', JSON.stringify(update, null, 2));

  try {
    // Check if it's a message and has text
    if (update.message && update.message.text) {
      const message = update.message;
      const chatId = message.chat.id;
      const text = message.text ? message.text.trim() : '';
      const user = message.from;
      
      // Tell Telegram "Bot is typing..."
      // We don't wait for this, just send it.
      sendChatAction(chatId, "typing");

      // Handle the user's message
      await handleUserMessage(chatId, text, user);
    
    } else if (update.callback_query) {
      // Handle button clicks
      const callback = update.callback_query;
      const chatId = callback.message.chat.id;
      const callbackData = callback.data;
      
      // 1. Answer the callback immediately to remove "loading"
      await answerCallbackQuery(callback.id);

      // 2. Tell Telegram "Bot is typing..."
      sendChatAction(chatId, "typing");

      // 3. Handle the logic
      if (callbackData.startsWith('lang_')) {
        await handleSetLanguage(chatId, callbackData.split('_')[1]);
      }
    }
  } catch (error) {
    console.error("Error in main handler:", error.message);
  }

  // Finally, send an "OK" response to Telegram
  // This tells Telegram "I got the message, don't send it again."
  // This is what stops the retry-storm!
  res.status(200).send('OK');
});


/* --------------------- Message Router (FIXED) ---------------------- */
async function handleUserMessage(chatId, text, user) {
  console.log(`Routing message: "${text}"`);
  
  const textLower = text.toLowerCase().trim();
  const userName = user.first_name || 'User';

  // All commands are fast (mocked or WIP)
  if (textLower === '/start') {
    await startUserRegistration(chatId, userName);
  }
  else if (textLower === 'book bus' || textLower === '/book') {
    console.log("✅ Handling book bus command");
    await handleBusSearch(chatId);
  }
  else if (textLower.startsWith('show seats')) {
    await handleSeatMap(chatId, text);
  }
  else if (textLower.startsWith('book seat')) {
    await handleSeatSelection(chatId, text);
  }
  else if (textLower === '/language' || textLower === 'language') {
    await handleLanguageSelection(chatId);
  }
  else if (textLower === 'help' || textLower === '/help') {
    console.log("✅ Handling help command");
    await sendHelpMessage(chatId);
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
    await handleUserProfile(chatId);
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

// This function is FAST (mocked).
async function startUserRegistration(chatId, userName) {
  console.log(`Welcoming user: ${userName} (${chatId})`);
  try {
    await sendMessage(chatId, MESSAGES.welcome_back.replace('{name}', userName));
    await sendHelpMessage(chatId);
  } catch (error) {
    console.error('❌ Registration error:', error.message);
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

// This function is FAST (sends text).
async function sendHelpMessage(chatId) {
  await sendMessage(chatId, MESSAGES.help, "Markdown");
}

// This function is FAST (WIP).
async function handleSystemStatus(chatId) {
  await sendMessage(chatId, MESSAGES.feature_wip);
}

// This function is FAST (mocked).
async function handleBusSearch(chatId) {
  try {
    console.log("🔄 Starting bus search...");
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

// This function is FAST (mocked).
async function handleSeatMap(chatId, text) {
  try {
    const busMatch = text.match(/(BUS\d+)/i);
    const busID = busMatch ? busMatch[1].toUpperCase() : null;
    
    if (!busID) {
      await sendMessage(chatId, MESSAGES.specify_bus_id, "Markdown");
      return;
    }
    
    const seatMap = generateSeatMap(busID); // Mocked data
    await sendMessage(chatId, seatMap, "Markdown");
    
  } catch (error) {
    console.error('❌ Seat map error:', error.message);
    await sendMessage(chatId, MESSAGES.seat_map_error.replace('{busID}', 'specified bus'), "Markdown");
  }
}

// All functions below are "Work in Progress" because they
// would require a real, slow database call.

async function handleSeatSelection(chatId, text) {
  await sendMessage(chatId, MESSAGES.feature_wip, "Markdown");
}

async function handleBookingInfo(chatId) {
  await sendMessage(chatId, MESSAGES.feature_wip, "Markdown");
}

async function handleCancellation(chatId, text) {
  await sendMessage(chatId, MESSAGES.feature_wip, "Markdown");
}

async function handleUserProfile(chatId) {
  await sendMessage(chatId, MESSAGES.feature_wip, "Markdown");
}

async function handleLiveTracking(chatId, text) {
  await sendMessage(chatId, MESSAGES.feature_wip, "Markdown");
}

/* --------------------- Mock Data Functions (FAST) ---------------------- */
// These are translated from your Apps Script

function getAvailableBuses() {
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
      availableSeats: 15
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
      availableSeats: 8
    }
  ];
}

function getBusInfo(busID) {
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

function generateSeatMap(busID) {
  const busInfo = getBusInfo(busID) || { from: 'N/A', to: 'N/A', date: 'N/A', time: 'N/A' };

  let seatMap = `🚍 *Seat Map - ${busID}*\n`;
  seatMap += `📍 ${busInfo.from} → ${busInfo.to}\n`;
  seatMap += `🕒 ${busInfo.date} ${busInfo.time}\n\n`;
  seatMap += `Legend: 🟩 Available • ⚫ Booked\n\n`;
  
  // This is a static, mocked map
  seatMap += `🟩1A 🟩1B     🚌     🟩1C 🟩1D\n`;
  seatMap += `🟩2A 🟩2B ...       🟩2C 🟩2D\n`;
  seatMap += `⚫3A 🟩3B           🟩3C ⚫3D\n`;
  seatMap += `🟩4A 🟩4B           🟩4C 🟩4D\n`;
  seatMap += `🟩5A ⚫5B           🟩5C 🟩5D\n`;
  
  seatMap += `\n📊 *37* seats available / 40\n\n`; // This is mocked
  seatMap += `💡 *Book a seat:* "Book seat ${busID} SEAT_NUMBER"\n`;
  seatMap += `   Example: "Book seat ${busID} 1A"`;
  
  return seatMap;
}


/* --------------------- Helper Functions (axios) ---------------------- */

// Helper function to send a message (replaces your `sendMessage`)
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

// Helper function to send "typing..." (replaces `sendChatAction`)
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

// Helper function to answer callbacks (replaces `answerCallbackQuery`)
async function answerCallbackQuery(callbackQueryId) {
  try {
    await axios.post(`${TELEGRAM_API}/answerCallbackQuery`, {
      callback_query_id: callbackQueryId,
    });
  } catch (error) {
    console.error('Error answering callback:', error.response ? error.response.data : error.message);
  }
}

// Start the server (Vercel handles this automatically)
// But for this file to be complete, we must export the app
module.exports = app;
