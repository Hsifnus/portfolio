const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const userSchema = new Schema({
    ip: {
        type: String,
        required: true
    },
    likedSongs: [
        {
            type: Schema.Types.ObjectId,
            ref: 'Song'
        }
    ]
});

module.exports = mongoose.model('User', userSchema);