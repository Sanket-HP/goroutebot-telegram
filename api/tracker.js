const { sendLiveLocationUpdates } = require('../index');

module.exports = async (req, res) => {
    // Vercel Cron Jobs call this endpoint via a simple GET request.
    if (req.method !== 'GET' && req.method !== 'HEAD') {
        return res.status(405).send('Method Not Allowed');
    }
    
    try {
        // Run the core logic defined in index.js to update locations and notify users.
        const status = await sendLiveLocationUpdates(); 
        
        console.log(`CRON JOB: Tracking batch completed. Updates sent: ${status.updatesSent}`);
        
        res.status(200).send({ 
            success: true, 
            message: "Tracking batch completed.", 
            updates_sent: status.updatesSent 
        });
    } catch (error) {
        console.error("CRON JOB FAILED:", error.message);
        res.status(500).send({ success: false, message: "Tracking failed.", error: error.message });
    }
};
