const express = require('express');
const bodyParser = require('body-parser');
const graphqlHttp = require('express-graphql');
const { buildSchema } = require('graphql');
const mongoose = require('mongoose');
const sha256 = require('js-sha256');

const app = express();

const Song = require('./models/song');
const User = require('./models/user');

const passHash = '43bb6a5a071eff294c5aeed094832ba6dfba2999edbc14f00602982530c43c04';

mongoose.Types.ObjectId.prototype.valueOf = function () {
	return this.toString();
};

const queryModel = (model) => {
    return model.find()
    .then(models => {
        return models.map(model => {
            return {
                ...model._doc,
                id: model._id
            };
        })
    })
    .catch( err => {
        throw err;
    })
}

const removeElement = (array, element) => {
    return array.filter((value) => {
        console.log(value + " " + element + " " + !value.equals(element));
        return !value.equals(element);
    });
}

const findSongs = (songIds) => {
    return Song.findById({_id: {$in: eventIds}})
    .then(songs => {
        return songs.map(song => {
            return {
                ...song._doc,
                _id: song.id,
                likedBy: findUsers.bind(this, song._doc.likedBy)
            };
        });
    })
    .catch(err => {
        throw err;
    })
}

const findUsers = userId => {
    return User.findById(userId)
    .then(user => {
        return {
            ...user._doc, 
            _id: user.id, 
            likedSongs: findSongs.bind(this, user._doc.likedSongs)
        };
    })
    .catch(err => {
        throw err;
    })
}

const contains = (array, query) => {
    var found = false;
    array.forEach((element) => {
        if (element.equals(query)) {
            found = true;
        }
    })
    return found;
}

app.use(bodyParser.json());

app.use('/graphql', 
    graphqlHttp({
        schema: buildSchema(`
            schema {
                query: BaseQuery
                mutation: BaseMutation
            }

            input SongInput {
                title: String!
                description: String!
                url: String!
                image: String
            }

            input UserInput {
                ip: String!
                songTitle: String!
            }

            type Song {
                _id: ID!
                title: String!
                description: String!
                url: String!
                image: String
                likedBy: [ID!]
            }

            type User {
                _id: ID!
                ip: String!
                likedSongs: [ID!]
            }

            type BaseQuery {
                songs: [Song!]!
                users: [User!]!
            }

            type BaseMutation {
                createSong(songInput: SongInput): Song
                likeSong(userInput: UserInput): User
                unlikeSong(userInput: UserInput): User
                flushLikes(password: String): String
            }
        `),
        rootValue: {
            songs: () => {
                return queryModel(Song);
            },
            users: () => {
                return queryModel(User);
            },
            createSong: (args) => {
                const song = new Song({
                    title: args.songInput.title,
                    description: args.songInput.description,
                    url: args.songInput.url,
                    image: args.songInput.image,
                    likedBy: []
                });
                return song.save()
                    .then(result => {
                        console.log(result);
                        return {...result._doc};
                    })
                    .catch(err => {
                        console.log(err);
                        throw err;
                    });
            },
            likeSong: args => {
                const ip = args.userInput.ip;
                var storedHash;
                const songTitle = args.userInput.songTitle;
                return Promise.resolve(sha256(ip))
                    .then(ipHash => {
                        storedHash = ipHash;
                        console.log(sha256(ip));
                        return User.findOne({ip: ipHash}).then(user => {
                            const bundle = user ? {uid: user.id, foundUser: user}
                                                : {uid: null, foundUser: null}
                            return bundle;
                        })
                    })
                    .then(bundle => {
                        console.log(songTitle);
                        return Song.findOne({title: songTitle}).then(song => {
                            if (!song) {
                                throw new Error('Song to like does not exist!');
                            }
                            return {...bundle, sid: song.id, foundSong: song};
                        })
                    })
                    .then(bundle => {
                        var savedUser;
                        const saveToUser = () => {
                            if (bundle.foundUser) {
                                if (contains(bundle.foundUser.likedSongs, bundle.sid)) {
                                    throw new Error('User has already liked this song!');
                                }
                                bundle.foundUser.likedSongs.push(bundle.sid);
                                    return bundle.foundUser.save()
                                    .then(result => {
                                        console.log(result);
                                        savedUser =  { ...result._doc, _id: result._id};
                                    });
                            } else {
                                const user = new User({
                                    ip: storedHash,
                                    likedSongs: [bundle.sid]
                                });
                                return user.save()
                                .then(result => {
                                    bundle.uid = result.id;
                                    console.log(result);
                                    savedUser = { ...result._doc, _id: result._id};
                                });
                            }
                        };
                        return Promise.resolve(saveToUser())
                            .then(() => {
                                bundle.foundSong.likedBy.push(bundle.uid);
                                return bundle.foundSong.save().then(() => {
                                    return savedUser;
                                });
                            });
                    });
            },
            unlikeSong: (args) => {
                const ip = args.userInput.ip;
                const songTitle = args.userInput.songTitle;
                return Promise.resolve(sha256(ip))
                    .then(ipHash => {
                        console.log(sha256(ip));
                        return User.findOne({ ip: ipHash }).then(user => {
                            if (!user) {
                                throw new Error('User has not liked any songs yet!');
                            }
                            return Song.findOne({ title: songTitle }).then(song => {
                                if (!contains(user.likedSongs, song.id)) {
                                    throw new Error('User does not have a like placed on this song!');
                                }
                                existingUser = user;
                                const bundle = { uid: user.id, foundUser: user }
                                console.log(bundle);
                                return bundle;
                            })
                        })
                    })
                    .then(bundle => {
                        return Song.findOne({ title: songTitle}).then((song) => {
                            if (song) {
                                song.likedBy = removeElement(song.likedBy, bundle.uid);
                                return song.save().then(() => {
                                    return { sid: song.id, foundUser: bundle.foundUser };
                                });
                            } else {
                                throw new Error('Song does not exist!');
                            }
                        })
                        .then(args => {
                            args.foundUser.likedSongs = removeElement(args.foundUser.likedSongs, args.sid);
                            return args.foundUser.save();
                        });
                    })
                    .then(result => {
                        console.log(result);
                        return { ...result._doc, _id: result.id};
                    })
                    .catch(err => {
                        console.log(err);
                        throw err;
                    });
            },
            flushLikes: (args) => {
                return Promise.resolve(sha256(args.password)).then(hash => {
                    if (hash !== passHash) {
                        throw new Error('Permission to flush denied');
                    }
                }).then(() => {
                    return Song.find().then(songs => {
                        return songs.map(song => {
                            song.likedBy = [];
                            return song.save().catch(err => { throw err; });
                        });
                    });
                }).then(() => {
                    return User.find().then(users => {
                        return users.map(user => {
                            user.likedSongs = [];
                            return user.save().catch(err => { throw err; });
                        });
                    });
                }).then(() => {
                    return 'Flush successful.';
                }).catch(err => {
                    throw err;
                });
            }
        },
        graphiql: true
    })
);

mongoose
    .connect(
    `mongodb+srv://${process.env.MONGO_USER}:${
        process.env.MONGO_PASSWORD
    }@portfolio-dev-lh5ns.gcp.mongodb.net/${process.env.MONGO_DB}?retryWrites=true`,
        { useNewUrlParser: true }
    ).then(() => {
        app.listen(3000);
    }).catch(err => {
        console.log(err);
    });