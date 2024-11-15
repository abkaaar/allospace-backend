const User = require("../models/User");
const Space = require("../models/Space");
const { createSecretToken } = require("../utils/SecretToken");
const bcrypt = require("bcryptjs");
const sendEmail = require("../utils/sendEmail");
const crypto = require("crypto");
const { asyncHandler } = require("../middlewares/error");
const Paystack = require('paystack-api'); // Ensure you have the correct package
const paystackApi = Paystack(process.env.PAYSTACK_SECRET_KEY); // Initialize with your secret key


module.exports.Signup = asyncHandler(async (req, res, next) => {
  const {
    name,
    phone,
    companyName,
    address,
    country,
    city,
    email,
    password,
    createdAt,
  } = req.body;

  // Check if user already exists
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    return res.status(400).json({ message: "User already exists" });
  }

  // Determine role based on the presence of companyName
  let role = companyName ? "host" : "customer";

  // Create new user
  const user = await User.create({
    name,
    phone,
    companyName,
    address,
    country,
    city,
    email,
    password,
    role,
    createdAt,
  });

  // create token
  const token = createSecretToken(user._id);

  res.cookie("token", token, {
    withCredentials: true,
    httpOnly: false,
  });

  res.status(201).json({
    message: "User Registered successfully",
    success: true,
    email,
    token,
  });
});

module.exports.Login = asyncHandler(async (req, res, next) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: "All fields are required" });
  }
  const user = await User.findOne({ email });
  if (!user) {
    return res.status(404).json({ message: "email or user not found" });
  }
  const auth = await bcrypt.compare(password, user.password);
  if (!auth) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  // create token
  const token = createSecretToken(user._id);
  res.cookie("token", token, {
    httpOnly: true,
    secure: true,
    // secure: process.env.NODE_ENV === "production",
    sameSite: "None",
    maxAge: 24 * 60 * 60 * 1000, // Optional: 1 day expiration for the cookie
  });

  console.log("TOKEN: ", token)

  res.status(201).json({
    message: "User logged in successfully",
    success: true,
    role: user.role,
    token,
    user: {
      id: user._id,
      email: user.email,
      phoneNumber: user.phone,
      role: user.role,
      companyName: user.companyName,
      address: user.address,
      name: user.name, // Add any additional fields you want to include
    },
  });
});

module.exports.updateUser = asyncHandler(async (req, res, next) => {
  const userId = req.user._id; // Assuming you have user info from JWT middleware
  const updatedData = req.body;



  const updatedUser = await User.findByIdAndUpdate(userId, updatedData, {
    new: true,
  });

  if (!updatedUser) {
    return res.status(404).json({ message: "User not found" });
  }

  console.log("updated user",updatedUser)

  // If the address was updated, reflect the change in the Space model
  if (updatedData.address) {
    console.log('Updating spaces with new address:', updatedData.address);

    await Space.updateMany(
      { address: updatedUser.address  }, // Find spaces linked to this user's address
      { $set: { address: updatedData.address } } // Update with new address
    );
  }

  res
    .status(200)
    .json({ user: updatedUser, message: "User updated successfully" });
});

// Controller function to fetch user info
module.exports.getUser = asyncHandler(async (req, res) => {
  const userId = req.user._id; // Assuming you extract the user ID from auth middleware

  const user = await User.findById(userId).select("-password"); // Exclude password
  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  res.status(200).json({ success: true, user });

});

module.exports.Payment = asyncHandler(async (req, res, next) => {
  const { name, email, bank, account_number } = req.body;

  // Ensure userId is defined
  const userId = req.user.id;

  // Get the bank code based on the bank name provided
  //  const bankCode = await getBankCodeByName(bank);
try{
  const response = await paystackApi.subaccount.create({
    business_name: name,
    email,
    settlement_bank: bank,
    account_number: account_number,
    percentage_charge: '5.0' // Set this to the desired percentage charge
  });

  if (!response || !response.data || !response.data.subaccount_code) {
    throw new Error("Invalid response from Paystack API");
  }
  const subaccountId = response.data.subaccount_code;

  // Step 2: Update the user document with payment details
  const updatedUser = await User.findByIdAndUpdate(
    userId,
    {
      "paymentDetails.businessName": name,
      "paymentDetails.bankName": bank,
      "paymentDetails.bankAccountDetails": account_number,
      "paymentDetails.paystackSubaccountId": subaccountId,
    },
    { new: true }
  );

  res.status(200).json({
    message: "Payment details saved successfully",
    paymentDetails: updatedUser.paymentDetails,
  });
}catch(error){
  console.error("Error in Payment method:", error);
    res.status(500).json({ message: "Failed to process payment", error: error.message });
}
});

// @desc    Forgot Password Initialization
exports.forgotPassword = asyncHandler(async (req, res, next) => {
  // Send Email to email provided but first check if user exists
  const { email } = req.body;

  const user = await User.findOne({ email });

  if (!user) {
    // return next(new ErrorResponse("No email could not be sent", 404));
    return res
      .status(404)
      .json({ message: "User not available, please register" });
  }

  // Reset Token Gen and add to database hashed (private) version of token
  const resetToken = user.getResetPasswordToken();

  await user.save();

  // Create reset url to email to provided email
  const resetUrl = `${process.env.FRONTEND_URL}/passwordreset/${resetToken}`;

  // HTML Message
  const message = `
      <h1>You have requested a password reset</h1>
      <p>Please use the following link to reset your password:</p>
      <a href=${resetUrl} clicktracking=off>${resetUrl}</a>
    `;

  try {
    await sendEmail({
      to: user.email,
      subject: "Password Reset Request",
      text: `To reset your password, use the following link: ${resetUrl}`,
      html: message, // Pass the HTML message
    });

    res.status(200).json({ success: true, data: "Email Sent" });
  } catch (err) {
    console.log(err);

    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;

    await user.save();
    return next(new ErrorResponse("Email could not be sent", 500));
  }
});

// @desc    Reset User Password
exports.resetPassword = asyncHandler(async (req, res, next) => {
  // Compare token in URL params to hashed token
  const resetPasswordToken = crypto
    .createHash("sha256")
    .update(req.params.resetToken)
    .digest("hex");

  const user = await User.findOne({
    resetPasswordToken,
    resetPasswordExpire: { $gt: Date.now() },
  });

  if (!user) {
    // return next(new ErrorResponse("Invalid Token", 400));
    console.error("Error in resetPassword route:"); // Log detailed error
    return res.status(400).json({ message: "Invalid Token" });
  }

  user.password = req.body.password;
  user.resetPasswordToken = undefined;
  user.resetPasswordExpire = undefined;

  await user.save();

  res.status(201).json({
    success: true,
    data: "Password Updated Success",
    token: user.getSignedJwtToken(),
  });
});

// reminder
const sendToken = (user, statusCode, res) => {
  const token = user.getSignedJwtToken();
  res.status(statusCode).json({ sucess: true, token });
};
