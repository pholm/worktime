const mongoose = require('mongoose');
const uniqueValidator = require('mongoose-unique-validator');

const logSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
    in: {
        type: Date,
        default: Date.now,
        required: true,
    },
    out: {
        type: Date,
    },
    type: {
        type: String,
        enum: ['automatic', 'manual'],
    },
});

const userSchema = new mongoose.Schema({
    user: { type: String, required: true, unique: true },
    name: String,
    logs: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Log',
        },
    ],
});

const daySchema = new mongoose.Schema({
    date: { type: Date, required: true },
    amount: { type: Number, required: true },
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
});

userSchema.plugin(uniqueValidator);

logSchema.set('toJSON', {
    transform: (document, returnedObject) => {
        returnedObject.id = returnedObject._id.toString();
        delete returnedObject._id;
        delete returnedObject.__v;
    },
});

daySchema.set('toJSON', {
    transform: (document, returnedObject) => {
        returnedObject.id = returnedObject._id.toString();
        delete returnedObject._id;
        delete returnedObject.__v;
    },
});

userSchema.set('toJSON', {
    transform: (document, returnedObject) => {
        returnedObject.id = returnedObject._id.toString();
        delete returnedObject._id;
        delete returnedObject.__v;
    },
});

const Log = mongoose.model('Log', logSchema);
const User = mongoose.model('User', userSchema);
const Day = mongoose.model('Day', daySchema);

module.exports = {
    Log,
    User,
    Day,
};
