require("dotenv").config();

var express = require("express");
var path = require("path");
var cookieParser = require("cookie-parser");
// const bodyParser = require('body-parser');
var logger = require("morgan");

const mongoose = require("mongoose");
const cors = require("cors");
const DATABASE_URL = process.env.DATABASE_URL;
const AuthRoute = require("./routes/AuthRoute");
const SpaceRoute = require("./routes/spaceRoute");
const BookRoute = require("./routes/BookingRoute");
const ReviewRoute = require("./routes/ReviewRoute");

const ErrorResponse = require("./utils/errorResponse");
const { errorHandler } = require("./middlewares/error");
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");
const compression = require("compression");

const PORT = process.env.PORT || 3000;

const connectWithRetry = async (retries = 5, delay = 5000) => {
  try {
    await mongoose.connect(DATABASE_URL, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("MongoDB is connected successfully");
  } catch (error) {
    console.error(
      `MongoDB connection failed. Retrying in ${delay / 1000} seconds...`
    );
    if (retries > 0) {
      setTimeout(() => connectWithRetry(retries - 1, delay), delay);
    } else {
      console.error("Failed to connect to MongoDB after several attempts.");
      process.exit(1); // exit the process if all retries fail
    }
  }
};

// Call the function to connect
connectWithRetry();

var app = express();
app.set("trust proxy", 1); // Trust the first proxy

const allowedOrigins = ["https://allospace.co", "http://localhost:5173", "https://www.allospace.co"];
app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true, // Enable if your app requires cookies
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

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

// Optional logging middleware to verify headers
app.use((req, res, next) => {
  res.on("finish", () => {
    console.log(`Request Origin: ${req.headers.origin}`);
    console.log(
      "Access-Control-Allow-Origin:",
      res.get("Access-Control-Allow-Origin")
    );
  });
  next();
});

// routes connection
app.use("/api/auth", AuthRoute);
app.use("/", SpaceRoute);
app.use("/", BookRoute);
app.use("/", ReviewRoute);

// catch 404 and forward to error handler
app.use((req, res, next) => {
  next(new ErrorResponse("Resource not found", 404));
});

//global error handler
app.use(errorHandler);

// start server
const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

process.on("unhandledRejection", (err, promise) => {
  console.log(`Logged Error: ${err.message}`);
  server.close(() => process.exit(1));
});
