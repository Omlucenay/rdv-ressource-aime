require('dotenv').config({ path: '/home/aire2407/rdv-aime/.env' });
const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Body parser
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Session
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { secure: true, maxAge: 24 * 60 * 60 * 1000 }
}));

// Routes
const indexRouter = require('./routes/index');
const authRouter = require('./routes/auth');
const calendarRouter = require('./routes/calendar');
const bookingRouter = require('./routes/booking');
const webhookRouter = require('./routes/webhook');

app.use('/', indexRouter);
app.use('/auth', authRouter);
app.use('/calendar', calendarRouter);
app.use('/booking', bookingRouter);
app.use('/webhooks', webhookRouter);
const karlaRouter = require('./routes/karla');
app.use('/karla', karlaRouter);

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Une erreur est survenue.');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Serveur démarré sur le port ${PORT}`);
});

module.exports = app;