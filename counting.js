const fs = require('fs');

let COUNTING_MUTE_ROLE = null;
let HIGHEST_COUNTER_ROLE = null;

let lastNumber = null;
let lastUser = null;

const COUNTER_FILE = './counter.json';
let TOTAL_COUNTS = null;

let highestCounter = null;

const LAST_FIVE_MESSAGES = [];
let lastFiveIndex = 0;

module.exports = {
  ready: function(client) {
    COUNTING_MUTE_ROLE = client.guilds.first().roles.find('name', 'Counting Mute');
    HIGHEST_COUNTER_ROLE = client.guilds.first().roles.find(r => r.name.startsWith('Highest Counter'));

    TOTAL_COUNTS = JSON.parse(fs.readFileSync(COUNTER_FILE, 'utf8'));
    let highestId = null;
    Object.keys(TOTAL_COUNTS).forEach(userId => {
      // Check to make sure user exists and that they're the new highest
      if (!highestId || TOTAL_COUNTS[userId] > TOTAL_COUNTS[highestId] && client.guilds.first().members.find('id', userId)) {
        highestId = userId;
      }
    });
    highestCounter = client.guilds.first().members.find('id', highestId);
    if (highestCounter) highestCounter.addRole(HIGHEST_COUNTER_ROLE);

    // Prevent user from deleting messages (fix if needed)
    client.on('messageDelete', msg => {
      if (!msg.channel.name.startsWith('counting')) return;

      for (let i = 0; i < 5; i++) {
        if (LAST_FIVE_MESSAGES[i] && LAST_FIVE_MESSAGES[i].id == msg.id) return; // Deleted by bot
      }

      if (parseInt(msg.content) == lastNumber) msg.channel.sendMessage(msg.content);
      mute(msg, 'Do not delete your messages! You have been muted for 1 minute.', 60*1000);
    });

    // Prevent users from editing messages (fix if needed)
    client.on('messageUpdate', (oldMsg, newMsg) => {
      mute(newMsg, 'Do not edit your messages! You have been muted for 1 minute.', 60*1000);
      if (parseInt(oldMsg.content) == lastNumber) oldMsg.channel.sendMessage(oldMsg.content);
    });
  },
  message: function(client, msg) {

    if (msg.content == '!highestcounter') {
      msg.channel.say(highestCounter.user.username);
      return;
    }

    if (!msg.channel.name.startsWith('counting')) return;

    if (msg.content.match(/^!force \d+$/) && msg.member.roles.find('name', 'Moderator')) {
      const number = msg.content.match(/^!force (\d+)$/)[1];
      updateNumber(number, null, msg);
      msg.react('✅');
      setTimeout(() => {
        LAST_FIVE_MESSAGES[lastFiveIndex++] = msg;
        lastFiveIndex %= 5;
        
        msg.delete();
      }, 2000);
      return;
    }

    if (!msg.content.match(/[1-9]\d*/)) {
      mute(msg, 'That is not a valid number! You have been muted for 1 minute.', 60*1000);
      return;
    }

    if (lastNumber !== null && msg.content != (lastNumber + 1).toString()) {
      mute(msg, `That is not the next number! The next number is ${lastNumber + 1}.`);
      return;
    }

    if (lastUser == msg.member.user) {
      mute(msg, `You cannot say a number twice in a row. You have been muted for 30 seconds.`, 30*1000);
      return;
    }

    // Update number
    updateNumber(lastNumber + 1, msg.member.user, msg);

    // Increase counter for user
    if (!TOTAL_COUNTS[msg.member.user.id]) TOTAL_COUNTS[msg.member.user.id] = 0;
    TOTAL_COUNTS[msg.member.user.id]++;

    // Change role holder if needed
    if (!highestCounter || TOTAL_COUNTS[msg.member.user.id] > TOTAL_COUNTS[highestCounter.user.id]) {
      if (highestCounter) highestCounter.removeRole(HIGHEST_COUNTER_ROLE);
      highestCounter = msg.member;
      highestCounter.addRole(HIGHEST_COUNTER_ROLE);
    }
    updateHighestCounterRole(); // Update role name if needed

    if (lastNumber % 5 === 0) saveFile(); // Save TOTAL_COUNTS every 5 messages
  }
}

function updateNumber(num, user, msg) {
  lastNumber = parseInt(num);
  lastUser = user;
  if (lastNumber % 1000 == 0) {
    msg.channel.setName('counting-'+(Math.floor(lastNumber/1000))+'k');
  }
}

function mute(msg, reason, length) {
  LAST_FIVE_MESSAGES[lastFiveIndex++] = msg;
  lastFiveIndex %= 5;
  
  msg.delete();
  msg.author.send(reason);
  if (!length) return;
  msg.member.addRole(COUNTING_MUTE_ROLE);
  setTimeout(() => {
    msg.member.removeRole(COUNTING_MUTE_ROLE);
  }, length);
}

let currentlySaving = false;
function saveFile() {
  if (currentlySaving) return;
  currentlySaving = true;
  fs.writeFile(COUNTER_FILE, JSON.stringify(TOTAL_COUNTS), () => { currentlySaving = false; });
}

function updateHighestCounterRole() {
  const highestCount = TOTAL_COUNTS[highestCounter.user.id];
  if (highestCount % 100 === 0) {
    HIGHEST_COUNTER_ROLE.setName(`Highest Counter (${(highestCount/1000).toFixed(1)}k)`)
  }
}