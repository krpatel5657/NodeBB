import meta = require('../meta');
import user = require('../user');
import plugins = require('../plugins');
import privileges = require('../privileges');

import sockets = require('../socket.io');


module.exports = function (Messaging) {
    Messaging.editMessage = async (uid, mid, roomId, content) => {
        await Messaging.checkContent(content);
        const raw = await Messaging.getMessageField(mid, 'content');
        if (raw === content) {
            return;
        }
        // The next line calls a function in a module that has not been updated to TS yet
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        const payload = await plugins.hooks.fire('filter:messaging.edit', {
            content: content,
            edited: Date.now(),
        });

        if (!String(payload.content).trim()) {
            throw new Error('[[error:invalid-chat-message]]');
        }
        await Messaging.setMessageFields(mid, payload);

        // Propagate this change to users in the room
        const [uids, messages] = await Promise.all([
            Messaging.getUidsInRoom(roomId, 0, -1),
            Messaging.getMessagesData([mid], uid, roomId, true),
        ]);

        uids.forEach((uid) => {
            sockets.in(`uid_${uid}`).emit('event:chats.edit', {
                messages: messages,
            });
        });
    };

    const canEditDelete = async (messageId, uid, type) => {
        let durationConfig = '';
        if (type === 'edit') {
            durationConfig = 'chatEditDuration';
        } else if (type === 'delete') {
            durationConfig = 'chatDeleteDuration';
        }

        const exists = await Messaging.messageExists(messageId);
        if (!exists) {
            throw new Error('[[error:invalid-mid]]');
        }

        // The next line calls a function in a module that has not been updated to TS yet
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        const isAdminOrGlobalMod = await user.isAdminOrGlobalMod(uid);

        if (meta.config.disableChat) {
            throw new Error('[[error:chat-disabled]]');
        } else if (!isAdminOrGlobalMod && meta.config.disableChatMessageEditing) {
            throw new Error('[[error:chat-message-editing-disabled]]');
        }
        // The next line calls a function in a module that has not been updated to TS yet
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        const userData = await user.getUserFields(uid, ['banned']);
        if (userData.banned) {
            throw new Error('[[error:user-banned]]');
        }
        // The next line calls a function in a module that has not been updated to TS yet
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        const canChat = await privileges.global.can('chat', uid);
        if (!canChat) {
            throw new Error('[[error:no-privileges]]');
        }

        const messageData = await Messaging.getMessageFields(messageId, ['fromuid', 'timestamp', 'system']);
        if (isAdminOrGlobalMod && !messageData.system) {
            return;
        }
        // The next line calls a function in a module that has not been updated to TS yet
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        const chatConfigDuration = meta.config[durationConfig];
        if (chatConfigDuration && Date.now() - messageData.timestamp > chatConfigDuration * 1000) {
            throw new Error(`[[error:chat-${type}-duration-expired, ${meta.config[durationConfig]}]]`);
        }

        if (messageData.fromuid === parseInt(uid, 10) && !messageData.system) {
            return;
        }

        throw new Error(`[[error:cant-${type}-chat-message]]`);
    };

    Messaging.canEdit = async (messageId, uid) => await canEditDelete(messageId, uid, 'edit');
    Messaging.canDelete = async (messageId, uid) => await canEditDelete(messageId, uid, 'delete');
};
