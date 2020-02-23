const { Client, RichEmbed } = require('discord.js');
const ytdl = require('ytdl-core');
const auth = require('./auth.json');
const searchYt = require('youtube-search');
const mongoose = require('mongoose');
const uri = 'mongodb://localhost:27017/test';
const conn = mongoose.createConnection(uri);
const Schema = mongoose.Schema;

var playlistSchema = new Schema({
    creator: String,
    name: String,
    songs: Array
});

var Playlist = conn.model('playlist', playlistSchema);

const prefix = "&";
const queue = new Map();
const userq = new Map();
const SEARCH_LENGTH = 5;
const opts = {
    maxResults: SEARCH_LENGTH,
    key: 'AIzaSyDbiPt3H2rsV0pyOBFhPrNtv0Qzlq4mkGg'
}

// Check database
conn.once('connected', function (err) {
    if (err) return console.log('Error connecting to db!');

    conn.db.listCollections({ name: 'playlists' })
    .next(function (err, collinfo) {
        if (collinfo) {
            console.log('Playlist collection already exists!');
            return;
        }
        else {
            var playlist = new Playlist({
                creator: 'Ultimate Reviewer',
                name: 'Bot',
                songs: [
                    {
                        title: 'Day6 - Time of our lives',
                        link: 'https://www.youtube.com/watch?v=vnS_jn2uibs&list=RDvnS_jn2uibs&start_radio=1&t=8'
                    }
                ]
            });

            Playlist.create(playlist, function (err) {
                if (err) return console.log('Playlist collection already exists or creation error occured!');

                console.log('Playlist collection creation success!');
                return conn.close();
            });
        }
    });
});

// Initialize Discord Bot
var bot = new Client();
var embed;

bot.login(auth.token);

bot.on('ready', function (evt) {
    console.log("Logged in as " + bot.user.tag);
});

bot.on('message', async msg => {
    if (msg.author.bot) return;

    const serverQueue = queue.get(msg.guild.id);
    const userQueue = userq.get(msg.author.id);

    if (userQueue) {
        checkEntered(msg, userQueue, serverQueue);
        return;
    }
    else if (!msg.content.startsWith(prefix)) return;
    else if (msg.content.startsWith(`${prefix}play`)) {
        searchMusic(msg);
        return;
    }
    else if (msg.content == `${prefix}skip`) {
        skipMusic(msg, serverQueue);
        return;
    }
    else if (msg.content == `${prefix}stop`) {
        stopMusic(msg, serverQueue);
        return;
    }
    else if (msg.content.startsWith(`${prefix}pl`)) {
        playlistOpts(msg, userQueue);
        return;
    }
    else if (msg.content == "&help") {
        embed = new RichEmbed()
            .setTitle('ULTIMATE REVIEWER HELP')
            .setColor(0x00FF00)
            .setDescription(`Bot command list:\n
                            **Entertainment Commands**\n
                            \`&play\` \`&skip\` \`&stop\`\n
                            **Reviewee Commands**\n
                            \`&list\` \`&review\` \`&stats\`\n
                            **Reviewer Commands**\n
                            \`&add\` \`&modify\`\n
                            Have fun!\n`
            );
        msg.channel.send(embed);
    }
});

//** 
//**    BOT FUNCTIONS
//** 

function searchPlaylistDb() {
    
}

function playlistOpts(msg, userQueue) {
    var opt = msg.content.substr(3, msg.content.length);

    if (opt.startsWith('add')) {
        opt = opt.substr(4, opt.length);

        Playlist.findOne({name: opt}, function(err, pl) {
            if (err) return err;

            if(pl) {

            }
            else {
                embed = new RichEmbed()
                    .setTitle('PLAYLIST NOT FOUND!')
                    .setColor(0x00FF00)
                    .setDescription(`Please enter an existing playlist name`
                    );
                msg.channel.send(embed);
            }
        });
    }
}

function searchMusic(msg) {
    searchYt(msg.content.substr(6, msg.content.length), opts, function (err, res) {
        if (err) return console.log(err);

        var list = [SEARCH_LENGTH];

        for (let i = 0; i < res.length; i++) {
            list[i] = {
                title: res[i]['title'],
                link: res[i]['link']
            };
        }

        const userqConstruct = {
            waiting: true,
            list: list
        }

        userq.set(msg.author.id, userqConstruct);

        var str = '';

        for (let i = 0; i < res.length; i++) {
            str += `\`${i + 1}\` **${list[i].title}**\n`;
        }

        embed = new RichEmbed()
            .setTitle('QUERY RESULTS')
            .setColor(0x00FF00)
            .setDescription(`The results for query *${msg.content.substr(6, msg.content.length)}* are: \n
                            ${str}\n
                            *By: ${msg.author.username}*`);
        msg.channel.send(embed);
    });
}

function checkEntered(msg, userQueue, serverQueue) {
    if (userQueue.list[parseInt(msg.content) - 1]) {
        var title = userQueue.list[parseInt(msg.content) - 1].title;
        var link = userQueue.list[parseInt(msg.content) - 1].link;
        userq.delete(msg.author.id);
        playMusic(msg, serverQueue, title, link);
    }
    else {
        userq.delete(msg.author.id);
        embed = new RichEmbed()
            .setColor(0xFF0000)
            .setDescription(`**Invalid index!**`);
        msg.channel.send(embed);
    }
}

async function playMusic(message, serverQueue, title, link) {

    const voiceChannel = message.member.voiceChannel;
    if (!voiceChannel) return message.channel.send(`You are not in a voice channel!`);
    const permissions = voiceChannel.permissionsFor(message.client.user);
    if (!permissions.has('CONNECT') || !permissions.has('SPEAK')) {
        return message.channel.send(`I don't have permission to join that voice channel! :(`);
    }

    const song = {
        title: title,
        url: link
    };

    if (!serverQueue) {
        const queueContruct = {
            textChannel: message.channel,
            voiceChannel: voiceChannel,
            connection: null,
            songs: [],
            volume: 5,
            playing: true,
            msg: message
        };

        queue.set(message.guild.id, queueContruct);

        queueContruct.songs.push(song);

        try {
            var connection = await voiceChannel.join();
            queueContruct.connection = connection;
            play(message.guild, queueContruct.songs[0], message);
        }
        catch (err) {
            console.log(err);
            queue.delete(message.guild.id);
            return message.channel.send(err);
        }
    }
    else {
        serverQueue.songs.push(song);
        // console.log(serverQueue.songs);
        return message.channel.send(`${song.title} has been added!`);
    }
}

function play(guild, song, message) {
    const serverQueue = queue.get(guild.id);
    console.log(serverQueue.songs);
    if (!song) {
        serverQueue.voiceChannel.leave();
        queue.delete(guild.id);
        return;
    }

    embed = new RichEmbed()
        .setTitle('Currently playing...')
        .setColor(0x00FF00)
        .setDescription(`**${song.title}**`);
    serverQueue.msg.channel.send(embed);

    const dispatcher = serverQueue.connection.playStream(ytdl(song.url))
        .on('end', () => {
            console.log('Music ended!');
            serverQueue.songs.shift();
            play(guild, serverQueue.songs[0]);
        })
        .on('error', error => {
            console.error(error);
        });
    dispatcher.setVolumeLogarithmic(serverQueue.volume / 5);
}

function skipMusic(message, serverQueue) {
    if (!message.member.voiceChannel) return message.channel.send('You are not in a voice channel!');
    if (!serverQueue) return message.channel.send('There are no song for me to skip!');
    serverQueue.connection.dispatcher.end();
}

function stopMusic(message, serverQueue) {
    if (!message.member.voiceChannel) return message.channel.send('You are not in a voice channel!');
    serverQueue.songs = [];
    serverQueue.connection.dispatcher.end();
}