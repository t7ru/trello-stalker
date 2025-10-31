const https = require('https');
const fs = require('fs');
const path = require('path');

const CONFIG = {
  trello_url: process.env.TRELLO_JSON_URL,
  discord_webhook: process.env.DISCORD_WEBHOOK_URL,
  state_file: path.join(__dirname, 'board_state.json'),
};

function loadState() {
  try {
    if (fs.existsSync(CONFIG.state_file)) {
      const data = fs.readFileSync(CONFIG.state_file, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading state:', error);
  }
  return { 
    cards: {}, 
    lists: {}, 
    labels: {},
    board: {},
    lastCheck: new Date().toISOString() 
  };
}

function saveState(state) {
  try {
    fs.writeFileSync(CONFIG.state_file, JSON.stringify(state, null, 2));
  } catch (error) {
    console.error('Error saving state:', error);
  }
}

function fetchBoardData() {
  return new Promise((resolve, reject) => {
    https.get(CONFIG.trello_url, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (error) {
          reject(error);
        }
      });
    }).on('error', reject);
  });
}

function sendDiscordMessage(embed) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      embeds: [embed]
    });

    const url = new URL(CONFIG.discord_webhook);
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    const req = https.request(options, (res) => {
      let response = '';
      res.on('data', (chunk) => response += chunk);
      res.on('end', () => resolve(response));
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function createEmbed(changeType, data) {
  const colors = {
    card_created: 3066993,
    card_updated: 3447003,
    card_moved: 10181046,
    card_deleted: 15158332,
    attachment_added: 7506394,
    attachment_changed: 16776960,
    list_created: 3066993,
    list_updated: 3447003,
    list_archived: 15158332,
    label_changed: 16098851,
    board_updated: 3447003
  };

  const embed = {
    title: `${changeType.replace(/_/g, ' ').toUpperCase()}`,
    color: colors[changeType] || 3447003,
    timestamp: new Date().toISOString(),
    fields: []
  };

  // card changes
  if (changeType === 'card_created') {
    embed.description = `**${data.name}**`;
    embed.url = data.url;
    embed.fields.push({ name: 'List', value: data.listName, inline: true });
    if (data.labels && data.labels.length > 0) {
      embed.fields.push({ 
        name: 'Labels', 
        value: data.labels.map(l => l.name).join(', '), 
        inline: true 
      });
    }
    if (data.desc) {
      embed.fields.push({ name: 'Description', value: data.desc.substring(0, 1024) });
    }
    if (data.coverImage) {
      embed.image = { url: data.coverImage };
    }
  }

  if (changeType === 'card_updated') {
    embed.description = `**${data.name}**`;
    embed.url = data.url;
    
    if (data.changes.name) {
      embed.fields.push({ 
        name: 'Name Changed', 
        value: `${data.changes.name.old} → ${data.changes.name.new}` 
      });
    }
    if (data.changes.desc) {
      embed.fields.push({ 
        name: 'Description Changed', 
        value: `${data.changes.desc.new.substring(0, 500)}...` 
      });
    }
    if (data.changes.labels) {
      const oldLabels = data.changes.labels.old.map(l => l.name).join(', ') || 'None';
      const newLabels = data.changes.labels.new.map(l => l.name).join(', ') || 'None';
      embed.fields.push({ 
        name: 'Labels Changed', 
        value: `${oldLabels} → ${newLabels}` 
      });
    }
    if (data.changes.coverImage) {
      embed.fields.push({ 
        name: 'Cover Image Changed', 
        value: 'See image below' 
      });
      embed.image = { url: data.changes.coverImage.new };
    }
  }

  if (changeType === 'card_moved') {
    embed.description = `**${data.name}**`;
    embed.url = data.url;
    embed.fields.push({ 
      name: 'Moved', 
      value: `${data.oldList} → ${data.newList}` 
    });
    if (data.coverImage) {
      embed.thumbnail = { url: data.coverImage };
    }
  }

  if (changeType === 'label_changed') {
    embed.description = `**${data.name}**`;
    embed.url = data.url;
    const oldLabels = data.oldLabels.map(l => l.name).join(', ') || 'None';
    const newLabels = data.newLabels.map(l => l.name).join(', ') || 'None';
    embed.fields.push({ 
      name: 'Labels Changed', 
      value: `${oldLabels} → ${newLabels}` 
    });
    if (data.coverImage) {
      embed.thumbnail = { url: data.coverImage };
    }
  }

  if (changeType === 'attachment_added') {
    embed.description = `**${data.cardName}**`;
    embed.url = data.cardUrl;
    embed.fields.push({ name: 'Attachment Added', value: data.attachmentName, inline: true });
    embed.fields.push({ name: 'Type', value: data.mimeType || 'Unknown', inline: true });
    
    // show img as preview
    if (data.attachmentUrl && data.mimeType && data.mimeType.startsWith('image/')) {
      embed.image = { url: data.attachmentUrl };
    }
  }

  if (changeType === 'attachment_changed') {
    embed.description = `**${data.cardName}**`;
    embed.url = data.cardUrl;
    embed.fields.push({ 
        name: 'Attachment Renamed', 
        value: `${data.oldName} → ${data.newName}` 
    });
    
    if (data.attachmentUrl && data.mimeType && data.mimeType.startsWith('image/')) {
      embed.image = { url: data.attachmentUrl };
    }
  }

  // list changes
  if (changeType === 'list_created' || changeType === 'list_updated') {
    embed.description = `**${data.name}**`;
    if (data.changes) {
      Object.keys(data.changes).forEach(key => {
        embed.fields.push({ 
          name: key, 
          value: `${data.changes[key].old} → ${data.changes[key].new}` 
        });
      });
    }
  }

  if (changeType === 'list_archived') {
    embed.description = `**${data.name}** was archived`;
  }

  // board changes
  if (changeType === 'board_updated') {
    embed.description = `Board: **${data.name}**`;
    Object.keys(data.changes).forEach(key => {
      const change = data.changes[key];
      embed.fields.push({ 
        name: key, 
        value: `${JSON.stringify(change.old)} → ${JSON.stringify(change.new)}` 
      });
    });
  }

  return embed;
}

async function detectChanges(oldState, newBoard) {
  const changes = [];

  // board level changes
  if (oldState.board.name && oldState.board.name !== newBoard.name) {
    changes.push({
      type: 'board_updated',
      data: {
        name: newBoard.name,
        changes: {
          name: { old: oldState.board.name, new: newBoard.name }
        }
      }
    });
  }

  if (oldState.board.desc !== newBoard.desc) {
    changes.push({
      type: 'board_updated',
      data: {
        name: newBoard.name,
        changes: {
          description: { old: oldState.board.desc, new: newBoard.desc }
        }
      }
    });
  }

  // list changes
  const newLists = {};
  for (const list of newBoard.lists) {
    newLists[list.id] = list;
    
    if (!oldState.lists[list.id]) {
      changes.push({
        type: 'list_created',
        data: { name: list.name }
      });
    } else {
      const oldList = oldState.lists[list.id];
      const listChanges = {};
      
      if (oldList.name !== list.name) {
        listChanges.name = { old: oldList.name, new: list.name };
      }
      if (oldList.closed !== list.closed && list.closed) {
        changes.push({
          type: 'list_archived',
          data: { name: list.name }
        });
      }
      
      if (Object.keys(listChanges).length > 0) {
        changes.push({
          type: 'list_updated',
          data: { name: list.name, changes: listChanges }
        });
      }
    }
  }

  // card changes
  const newCards = {};
  for (const card of newBoard.cards) {
    newCards[card.id] = {
      name: card.name,
      desc: card.desc,
      idList: card.idList,
      labels: card.labels || [],
      idAttachmentCover: card.idAttachmentCover,
      attachments: card.attachments || [],
      url: card.url,
      closed: card.closed
    };

    const listName = newBoard.lists.find(l => l.id === card.idList)?.name || 'Unknown';
    
    if (!oldState.cards[card.id]) {
      const coverImage = card.idAttachmentCover 
        ? card.attachments?.find(a => a.id === card.idAttachmentCover)?.url 
        : null;
        
      changes.push({
        type: 'card_created',
        data: {
          name: card.name,
          url: card.url,
          listName,
          desc: card.desc,
          labels: card.labels || [],
          coverImage
        }
      });
    } else {
      const oldCard = oldState.cards[card.id];
      const cardChanges = {};

      if (oldCard.name !== card.name) {
        cardChanges.name = { old: oldCard.name, new: card.name };
      }

      if (oldCard.desc !== card.desc) {
        cardChanges.desc = { old: oldCard.desc, new: card.desc };
      }

      if (oldCard.idList !== card.idList) {
        const oldListName = newBoard.lists.find(l => l.id === oldCard.idList)?.name || 'Unknown';
        const coverImage = card.idAttachmentCover 
          ? card.attachments?.find(a => a.id === card.idAttachmentCover)?.url 
          : null;
          
        changes.push({
          type: 'card_moved',
          data: {
            name: card.name,
            url: card.url,
            oldList: oldListName,
            newList: listName,
            coverImage
          }
        });
      }

      // label changes
      const oldLabelIds = (oldCard.labels || []).map(l => l.id).sort();
      const newLabelIds = (card.labels || []).map(l => l.id).sort();
      if (JSON.stringify(oldLabelIds) !== JSON.stringify(newLabelIds)) {
        const coverImage = card.idAttachmentCover 
          ? card.attachments?.find(a => a.id === card.idAttachmentCover)?.url 
          : null;
        changes.push({
          type: 'label_changed',
          data: {
            name: card.name,
            url: card.url,
            oldLabels: oldCard.labels || [],
            newLabels: card.labels || [],
            coverImage
          }
        });
      }

      // cover img changes
      if (oldCard.idAttachmentCover !== card.idAttachmentCover) {
        const oldCover = oldCard.idAttachmentCover 
          ? oldCard.attachments?.find(a => a.id === oldCard.idAttachmentCover)?.url 
          : null;
        const newCover = card.idAttachmentCover 
          ? card.attachments?.find(a => a.id === card.idAttachmentCover)?.url 
          : null;
        
        if (oldCover !== newCover) {
          cardChanges.coverImage = { old: oldCover, new: newCover };
        }
      }

      // attachment changes
      const oldAttachmentsMap = new Map((oldCard.attachments || []).map(a => [a.id, a]));
      const newAttachmentsMap = new Map((card.attachments || []).map(a => [a.id, a]));

      for (const [id, attachment] of newAttachmentsMap.entries()) {
        if (!oldAttachmentsMap.has(id)) {
          changes.push({
            type: 'attachment_added',
            data: {
              cardName: card.name,
              cardUrl: card.url,
              attachmentName: attachment.name || attachment.fileName,
              attachmentUrl: attachment.url,
              mimeType: attachment.mimeType
            }
          });
        }
      }

      for (const [id, oldAttachment] of oldAttachmentsMap.entries()) {
        const newAttachment = newAttachmentsMap.get(id);
        if (newAttachment && oldAttachment.name !== newAttachment.name) {
          changes.push({
            type: 'attachment_changed',
            data: {
              cardName: card.name,
              cardUrl: card.url,
              oldName: oldAttachment.name,
              newName: newAttachment.name,
              attachmentUrl: newAttachment.url,
              mimeType: newAttachment.mimeType
            }
          });
        }
      }

      if (Object.keys(cardChanges).length > 0) {
        changes.push({
          type: 'card_updated',
          data: {
            name: card.name,
            url: card.url,
            changes: cardChanges
          }
        });
      }
    }
  }

  // deleted/archived cards
  for (const cardId in oldState.cards) {
    if (!newCards[cardId]) {
      const oldCard = oldState.cards[cardId];
      changes.push({
        type: 'card_deleted',
        data: {
          name: oldCard.name
        }
      });
    }
  }

  // push notifs
  for (const change of changes) {
    try {
      const embed = createEmbed(change.type, change.data);
      await sendDiscordMessage(embed);
      console.log(`Sent ${change.type} notification`);
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.error(`Error sending ${change.type} notification:`, error);
    }
  }

  return { newCards, newLists };
}

async function run() {
  if (!CONFIG.discord_webhook) {
    console.error('Error: DISCORD_WEBHOOK_URL environment variable is not set.');
    process.exit(1);
  }

  try {
    console.log('Fetching board data...');
    const board = await fetchBoardData();
    
    console.log('Loading previous state...');
    const oldState = loadState();
    
    console.log('Detecting changes...');
    const { newCards, newLists } = await detectChanges(oldState, board);
    
    console.log('Saving new state...');
    const newState = {
      cards: newCards,
      lists: newLists,
      labels: board.labels.reduce((acc, label) => {
        acc[label.id] = { name: label.name, color: label.color };
        return acc;
      }, {}),
      board: {
        name: board.name,
        desc: board.desc,
        url: board.url
      },
      lastCheck: new Date().toISOString()
    };
    
    saveState(newState);
    console.log('Done!');
  } catch (error) {
    console.error('Error in main run:', error);
    process.exit(1);
  }
}

run();