import express from "express";
import passport from "passport";
import { Strategy as FacebookStrategy } from "passport-facebook";
import session from "express-session";
import https from "https";
import fs from "fs";
import fetch from "node-fetch";
import axios from "axios";
import dotenv from "dotenv";
import Bot from "messenger-bot";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Store page tokens and IDs after login
let pageTokens = {};
global.pageToken = "";
let bots = [];

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
    session({
        secret: process.env.SESSION_SECRET || "your-secret-key",
        resave: false,
        saveUninitialized: false,
    })
);

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

let bot = null;
// Facebook OAuth configuration
passport.use(
    new FacebookStrategy(
        {
            clientID: "2056607948142802",
            clientSecret: "0dd85c3c2ff852a1e4b733ff59723cd7",
            callbackURL: "https://c0f4-103-26-247-130.ngrok-free.app/auth/facebook/callback",
            profileFields: ["id", "displayName", "email", "photos"],
            proxy: true,
        },
        async (accessToken, refreshToken, profile, done) => {
            try {
                // Print access token
                console.log("Access Token:", accessToken);

                // Fetch pages data when user authenticates
                const response = await fetch(
                    `https://graph.facebook.com/v16.0/me/accounts?access_token=${accessToken}`
                );
                const pages = await response.json();

                // Store page tokens
                let botPromises = pages.data.map((page) => {
                    return new Promise((resolve, reject) => {
                        pageTokens[page.id] = {
                            token: page.access_token,
                            name: page.name,
                        };
                        bot = new Bot({
                            token: page.access_token,
                            verify: "pirhotech",
                        });

                        bot.on("error", (err) => {
                            console.log(err.message);
                        });

                        bot.on("message", (payload, reply) => {
                            let text = payload.message.text;

                            bot.getProfile(payload.sender.id, (err, profile) => {
                                if (err) throw err;

                                reply({ text }, (err) => {
                                    if (err) throw JSON.stringify(err);

                                    console.log(
                                        `Echoed back to ${profile.first_name} ${profile.last_name}: ${text}`
                                    );
                                });
                            });
                        });
                        fs.writeFileSync("token.txt", page.access_token);
                        // Print page tokens
                        console.log(`Page Token for ${page.name}:`, page.access_token);
                        resolve(bot)
                    })
                });

                Promise.all(botPromises)
                    .then((initializedBots) => {
                        bots = initializedBots;
                        console.log("All bots initialized successfully!");
                    })
                    .catch((error) => {
                        console.error("Error initializing bots:", error);
                    });
                return done(null, {
                    profile: profile,
                    accessToken: accessToken,
                    pages: pages.data,
                });
            } catch (error) {
                return done(error);
            }
        }
    )
);


console.log(bot)

let data;

try {
    // Attempt to read the file
    data = fs.readFileSync("./token.txt", { encoding: "utf8" });
} catch (err) {
    // If the error is because the file doesn't exist, return an empty string
    if (err.code === "ENOENT") {
        console.log("File not found. Returning empty string.");
        data = "";
    } else {
        // If it's another error, throw it
        throw err;
    }
}

console.log(data);


// Helper functions for Facebook Messenger
const sendMessage = async (senderId, message, pageId) => {
    try {
        if (!pageTokens[pageId]) {
            throw new Error("Page token not found");
        }
        function getPageToken(pageId) {
            return pageId;
        }

        let options = {
            method: "POST",
            url: `https://graph.facebook.com/v17.0/${pageId}/messages`,
            params: {
                access_token: pageTokens[pageId].token,
            },
            headers: { "Content-Type": "application/json" },
            data: {
                recipient: { id: senderId },
                messaging_type: "RESPONSE",
                message: { text: message },
            },
        };
        let response = await axios.request(options);
        return response.status === 200 && response.statusText === "OK" ? 1 : 0;
    } catch (error) {
        console.error("Error sending message:", error);
        return 0;
    }
};

const setTypingOn = async (senderId, pageId) => {
    try {
        if (!pageTokens[pageId]) {
            throw new Error("Page token not found");
        }

        let options = {
            method: "POST",
            url: `https://graph.facebook.com/v17.0/${pageId}/messages`,
            params: {
                access_token: pageTokens[pageId].token,
            },
            headers: { "Content-Type": "application/json" },
            data: {
                recipient: { id: senderId },
                sender_action: "typing_on",
            },
        };
        let response = await axios.request(options);
        return response.status === 200 && response.statusText === "OK" ? 1 : 0;
    } catch (error) {
        console.error("Error setting typing indicator:", error);
        return 0;
    }
};

const setTypingOff = async (senderId, pageId) => {
    try {
        if (!pageTokens[pageId]) {
            throw new Error("Page token not found");
        }

        let options = {
            method: "POST",
            url: `https://graph.facebook.com/v17.0/${pageId}/messages`,
            params: {
                access_token: pageTokens[pageId].token,
            },
            headers: { "Content-Type": "application/json" },
            data: {
                recipient: { id: senderId },
                sender_action: "typing_off",
            },
        };
        let response = await axios.request(options);
        return response.status === 200 && response.statusText === "OK" ? 1 : 0;
    } catch (error) {
        console.error("Error setting typing indicator:", error);
        return 0;
    }
};

// Serialize user for the session
passport.serializeUser((user, done) => {
    done(null, user);
});

// Deserialize user from the session
passport.deserializeUser((user, done) => {
    done(null, user);
});

// Routes
app.get("/", (req, res) => {
    const isLoggedIn = req.isAuthenticated();
    res.send(`
        <!DOCTYPE html>
        <html lang="en">
            <head>
                <title>Facebook Login JavaScript Example</title>
                <meta charset="UTF-8">
                <style>
                    body { font-family: Arial, sans-serif; text-align: center; padding-top: 50px; }
                    .login-btn { 
                        background-color: #1877f2;
                        color: white;
                        padding: 12px 24px;
                        border: none;
                        border-radius: 4px;
                        text-decoration: none;
                        font-size: 16px;
                        margin: 10px;
                        display: inline-block;
                    }
                </style>
            </head>
            <body>
                <h2>Facebook Login Example</h2>
                <div id="status"></div>

                <script>
                    function statusChangeCallback(response) {
                        console.log('statusChangeCallback');
                        console.log(response);
                        if (response.status === 'connected') {
                            testAPI();
                        } else {
                            document.getElementById('status').innerHTML = 'Please log into this webpage.';
                        }
                    }

                    function checkLoginState() {
                        FB.getLoginStatus(function(response) {
                            statusChangeCallback(response);
                        });
                    }

                    window.fbAsyncInit = function() {
                        FB.init({
                            appId: '2056607948142802',
                            cookie: true,
                            xfbml: true,
                            version: 'v16.0'
                        });

                        FB.getLoginStatus(function(response) {
                            statusChangeCallback(response);
                        });
                    };

                    function testAPI() {
                        console.log('Welcome! Fetching your information....');
                        FB.api('/me', function(response) {
                            console.log('Successful login for: ' + response.name);
                            document.getElementById('status').innerHTML = 'Thanks for logging in, ' + response.name + '!';
                        });
                    }
                </script>

                <fb:login-button scope="public_profile,email" onlogin="checkLoginState();"></fb:login-button>

                <script async defer crossorigin="anonymous" src="https://connect.facebook.net/en_US/sdk.js"></script>
                <a href="/auth/facebook" class="login-btn">Login with Facebook (Passport)</a>
            </body>
        </html>
    `);
});

app.get("/auth/error", (req, res) => res.send("Unknown Error"));

app.get(
    "/auth/facebook",
    passport.authenticate("facebook", {
        scope: [
            "email",
            "pages_messaging",
            "pages_show_list",
            "pages_read_engagement",
            "pages_manage_metadata",
        ],
    })
);

app.get(
    "/auth/facebook/callback",
    passport.authenticate("facebook", {
        failureRedirect: "/login",
        successRedirect: "/messenger-dashboard",
    })
);

// Middleware to check if user is authenticated
function isAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
        return next();
    }
    res.redirect("/");
}
console.log(global);
console.log(pageTokens);

// console.log(bot);

app.get("/facebook", (req, res) => {
    if (bots.length === 0) {
        return res.send("Bots are not initialized yet.");
    }

    // Loop through each bot and verify the request
    bots.forEach((bot) => {
        bot._verify(req, res);
    });
});

app.post("/facebook", (req, res) => {
    if (bots.length === 0) {
        return res.send("Bots are not initialized yet.");
    }

    // Loop through each bot and handle messages
    bots.forEach((bot) => {
        bot._handleMessage(req.body);
    });

    res.end(JSON.stringify({ status: "ok" }));
});


app.get("/messenger-dashboard", isAuthenticated, async (req, res) => {
    try {
        const pages = req.user.pages;

        let pagesHtml = `
            <html>
                <head>
                    <title>Your Facebook Pages</title>
                    <style>
                        body { font-family: Arial, sans-serif; padding: 20px; }
                        .page-card {
                            border: 1px solid #ddd;
                            padding: 15px;
                            margin: 10px 0;
                            border-radius: 4px;
                        }
                        .message-form {
                            margin-top: 10px;
                        }
                        input[type="text"] {
                            padding: 8px;
                            margin-right: 10px;
                            width: 300px;
                        }
                        button {
                            padding: 8px 15px;
                            background-color: #1877f2;
                            color: white;
                            border: none;
                            border-radius: 4px;
                            cursor: pointer;
                        }
                    </style>
                </head>
                <body>
                    <h1>Your Facebook Pages</h1>
        `;

        pages.forEach((page) => {
            pagesHtml += `
                <div class="page-card">
                    <h2>${page.name}</h2>
                    <p>Page ID: ${page.id}</p>
                    
                </div>
            `;
        });

        pagesHtml += `
               
                </body>
            </html>
        `;

        res.send(pagesHtml);
    } catch (error) {
        console.error("Error fetching Facebook pages:", error);
        res.status(500).send("Error accessing Facebook pages");
    }
});

// Handles messages events and sends a response
function handleMessage(sender_psid, received_message) {
    let response;

    // Check if the message contains text
    if (received_message.text) {
        response = {
            text: `You sent: "${received_message.text}". How can I help you further?`,
        };
    } else {
        response = {
            text: "Sorry, I can only process text messages at the moment.",
        };
    }

    // Send the message via the Send API
    callSendAPI(sender_psid, response);
}

// Sends response messages via the Facebook Send API
function callSendAPI(sender_psid, response) {
    // Construct the message body
    const request_body = {
        recipient: {
            id: sender_psid,
        },
        message: response,
    };

    // Send the HTTP request to the Messenger Platform
    request(
        {
            uri: "https://graph.facebook.com/v12.0/me/messages",
            qs: { access_token: process.env.PAGE_ACCESS_TOKEN },
            method: "POST",
            json: request_body,
        },
        (err, res, body) => {
            if (!err) {
                console.log("Message sent successfully!");
            } else {
                console.error("Unable to send message:" + err);
            }
        }
    );
}

// Add this new endpoint to handle sending messages
app.post("/send-message", async (req, res) => {
    try {
        const { pageId, message } = req.body;

        if (!pageTokens[pageId]) {
            throw new Error("Page token not found");
        }

        // Get PSID (Page-Scoped ID) for the recipient
        const psidResponse = await fetch(
            `https://graph.facebook.com/v16.0/${pageId}/conversations?fields=participants&access_token=${pageTokens[pageId].token}`
        );
        const psidData = await psidResponse.json();

        if (!psidData.data || psidData.data.length === 0) {
            throw new Error("No conversations found");
        }

        // Get the first participant's PSID that isn't the page
        const recipient = psidData.data[0].participants.data.find(
            (p) => p.id !== pageId
        );

        console.log(recipient);

        if (!recipient) {
            throw new Error("No recipient found");
        }

        // Show typing indicator
        await setTypingOn(recipient.id, pageId);

        // Send the message
        const success = await sendMessage(recipient.id, message, pageId);

        // Turn off typing indicator
        await setTypingOff(recipient.id, pageId);

        if (success) {
            res.json({ success: true });
        } else {
            throw new Error("Failed to send message");
        }
    } catch (error) {
        console.error("Error sending message:", error);
        res.json({ success: false, error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

// const options = {
//   key: fs.readFileSync("key.pem"),
//   cert: fs.readFileSync("cert.pem"),
// };

// // Create the HTTPS server
// https.createServer(options, app).listen(3000, () => {
//   console.log("HTTPS server running on https://localhost:3000");
// });