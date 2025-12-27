const express = require('express');
const path = require('path');
const cors = require('cors');
const bodyParser = require('body-parser');
const { SMTPServer } = require('smtp-server');
const { simpleParser } = require('mailparser');

const app = express();
const HTTP_PORT = process.env.PORT || 3001; 
const SMTP_PORT = 2525; 

// In-memory store (volatile)
let emails = {};
let serverStats = {
  startedAt: new Date().toISOString(),
  emailsReceived: 0,
  lastEmailAt: null
};

app.use(cors());
app.use(bodyParser.json());

// --- SMTP SERVER ---
const mailServer = new SMTPServer({
  authOptional: true,
  disabledCommands: ['AUTH'],
  onData(stream, session, callback) {
    simpleParser(stream, (err, parsed) => {
      if (err) {
        console.error("Mail Parsing Error:", err);
        return callback(err);
      }
      
      if (parsed) {
        const recipients = parsed.to ? (Array.isArray(parsed.to) ? parsed.to : [parsed.to]) : [];
        
        recipients.forEach(recipientObj => {
          const toEmail = recipientObj.text || recipientObj.value?.[0]?.address;
          if (!toEmail) return;

          const [login, domain] = toEmail.split('@');
          if (!login || !domain) return;

          const key = `${domain.trim().toLowerCase()}:${login.trim().toLowerCase()}`;
          
          if (!emails[key]) emails[key] = [];

          emails[key].unshift({
            id: Math.random().toString(36).substring(7),
            from: parsed.from?.text || "Unknown",
            senderEmail: parsed.from?.text || "Unknown",
            subject: parsed.subject || "(No Subject)",
            date: new Date().toISOString(),
            body: parsed.text || parsed.html || "No content"
          });

          if (emails[key].length > 50) emails[key].pop();
          
          serverStats.emailsReceived++;
          serverStats.lastEmailAt = new Date().toISOString();
          console.log(`[SMTP] Email stored for: ${toEmail}`);
        });
      }
      callback();
    });
  }
});

// Start SMTP Server with catch to prevent crash on restricted ports
try {
  mailServer.listen(SMTP_PORT, () => {
    console.log(`[SMTP] Receiver active on port ${SMTP_PORT}`);
  });
} catch (e) {
  console.warn(`[SMTP] Failed to start SMTP server: ${e.message}`);
}

// --- API Endpoints ---

// Explicitly log API requests for debugging
app.use('/api', (req, res, next) => {
  console.log(`[API] ${req.method} ${req.url}`);
  next();
});

app.get('/api/messages', (req, res) => {
  const { login, domain } = req.query;
  if (!login || !domain) return res.status(400).json({ error: 'Missing identity' });
  const key = `${domain.toLowerCase()}:${login.toLowerCase()}`;
  res.setHeader('Content-Type', 'application/json');
  res.json(emails[key] || []);
});

app.get('/api/status', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.json({
    status: 'online',
    stats: serverStats,
    node: process.version
  });
});

// Catch-all for undefined API routes ONLY
app.all('/api/*', (req, res) => {
  res.status(404).json({ error: `API route not found: ${req.url}` });
});

// Serve React Frontend (Static assets)
const distPath = path.join(__dirname, 'dist');
app.use(express.static(distPath));

// Frontend Fallback (SPA routing)
app.get('*', (req, res) => {
  // If it's an API request that wasn't caught, it should have been 404ed above
  // This block only handles browser navigation
  res.sendFile(path.join(distPath, 'index.html'), (err) => {
    if (err) {
      res.status(500).send("Frontend not built. Run 'npm run build' first.");
    }
  });
});

app.listen(HTTP_PORT, () => {
  console.log(`[HTTP] Xinici Mail Server active on port ${HTTP_PORT}`);
});
