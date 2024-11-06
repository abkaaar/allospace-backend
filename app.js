require("dotenv").config();

var express = require("express");
var path = require("path");
var cookieParser = require("cookie-parser");
// const bodyParser = require('body-parser');
var logger = require("morgan");

const mongoose = require("mongoose");
const cors = require("cors");
const { DATABASE_URL, PORT } = process.env;
const AuthRoute = require('./routes/AuthRoute')
const SpaceRoute = require('./routes/spaceRoute')
const BookRoute = require('./routes/BookingRoute');
const ErrorResponse = require("./utils/errorResponse");
const {errorHandler} = require("./middlewares/error");
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");
const compression = require("compression");

// mongoose
//   .connect(DATABASE_URL, {
//     useNewUrlParser: true,
//     useUnifiedTopology: true,
//   })
//   .then(() => console.log("MongoDB is  connected successfully"))
//   .catch((err) => console.error(err));

const connectWithRetry = async (retries = 5, delay = 5000) => {
  try {
    await mongoose.connect(DATABASE_URL, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("MongoDB is connected successfully");
  } catch (error) {
    console.error(`MongoDB connection failed. Retrying in ${delay / 1000} seconds...`);
    if (retries > 0) {
      setTimeout(() => connectWithRetry(retries - 1, delay), delay);
    } else {
      console.error("Failed to connect to MongoDB after several attempts.");
      process.exit(1); // Exit the process if all retries fail
    }
  }
};

// Call the function to connect
connectWithRetry();

var app = express();
     

//performance Middleware
app.use(helmet());
app.use(compression());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
});
app.use(limiter);



app.use(logger("dev"));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));
app.use(cookieParser());
app.use(express.json({ limit: "10mb" })); // Increase JSON payload size limit
app.use(express.urlencoded({ limit: "10mb", extended: true }));


app.use(
  cors({
    origin: process.env.FRONTEND_URL,
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  })
);


// routes connection
app.use("/api/auth", AuthRoute);
app.use('/', SpaceRoute)
app.use('/', BookRoute)


// catch 404 and forward to error handler
app.use((req, res, next) => {
  next(new ErrorResponse('Resource not found', 404));
});

//global error handler
app.use(errorHandler)


// start server
const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

process.on("unhandledRejection", (err, promise) => {
  console.log(`Logged Error: ${err.message}`);
  server.close(() => process.exit(1));
});



// app.use(function (err, req, res, next) {
//   res.status(err.status || 500).json({
//     message: err.message,
//     error: req.app.get("env") === "development" ? err : {}
//   })
// });