const MyVosk = require('./my_vosk.js');
const { performWikipediaSearch } = require('../ai/api.js');
const mic = require('mic');
const { spawn, exec } = require('child_process');
const { keyboard, Key } = require("@nut-tree/nut-js");
const clipboardy = require("clipboardy").default;
const path = require("path");
const fs = require("fs");
const os = require('os');
const { ipcMain } = require('electron');
const stt = new MyVosk();

const DEFAULT_SETTINGS = {
    writeMode: false,
    volumeThreshold: 20,
    addressingTerm: 'сэр',
    coreStyle: 'quantum-lock',
    bgColor: 'default',
    coreSize: 'medium',
    // --- НОВЫЕ ПАРАМЕТРЫ ---
    musicPath: path.join(os.homedir(), 'Музыка', 'funks'), // Путь к папке с музыкой
    appKeywords: { // Словарь: "ключевое слово" : "команда запуска"
        "ютуб": 'firefox https://youtube.com',
        "телеграм": 'Telegram',
        "код": 'code .',
        "браузер": 'firefox',
        "терминал": 'kgx -- zsh'
    }
};

module.exports = function (win, initialSettings) {
    const micInstance = mic({
        rate: 16000,
        channels: 1,
        bitwidth: 16,
        encoding: 'signed-integer',
        device: 'default'
    });
    const input = micInstance.getAudioStream();

    let player = null;
    let current_music = 0;
    let open_video = false;
    let write_mode = initialSettings.writeMode;
    let is_activated = false;
    let is_speak = false;
    const ACTIVATION_TIMEOUT = 10000;
    let activationTimer = null;
    let current_volume_threshold = initialSettings.volumeThreshold;

    let current_addressing_term = initialSettings.addressingTerm;
    let current_core_style = initialSettings.coreStyle;
    let current_bg_color = initialSettings.bgColor;
    let current_core_size = initialSettings.coreSize;
    // --- НОВЫЕ ПЕРЕМЕННЫЕ СОСТОЯНИЯ ---
    // Разворачиваем путь к музыке, т.к. os.homedir() доступен
    let current_music_dir = initialSettings.musicPath ? initialSettings.musicPath.replace(/^~/, os.homedir()) : DEFAULT_SETTINGS.musicPath;
    let current_app_keywords = initialSettings.appKeywords;
    // -----------------------------------

    function count_files(ext, dir) {
        if (!fs.existsSync(dir)) return [];
        return fs.readdirSync(dir).filter(file => ext.includes(path.extname(file).toLowerCase()));
    }

    function media(music, mode) {
        if (player) {
            try { process.kill(player.pid, 'SIGTERM'); } catch (e) { }
            player = null;
        }

        player = spawn('mpv', [
            open_video ? '' : "--no-video",
            '--really-quiet',
            '--volume=100',
            music
        ].filter(Boolean), { stdio: 'ignore', detached: true });
        player.unref();

        if (mode) {
            post_command("Играет-" + path.basename(music));
        }
    }

    function write(text) {
        (async () => {
            try {
                await clipboardy.write(text + ' ');
                await keyboard.pressKey(Key.LeftControl, Key.V);
                await keyboard.releaseKey(Key.LeftControl, Key.V);
            } catch (error) {
                console.error("Ошибка при вводе текста:", error);
            }
        })();
    }

    function volume_regulate(text) {
        exec(`pactl set-sink-volume @DEFAULT_SINK@ ${text}%`);
    }

    function levenshteinDistance(str1, str2) {
        const len1 = str1.length;
        const len2 = str2.length;
        const matrix = Array(len1 + 1).fill(null).map(() => Array(len2 + 1).fill(0));

        for (let i = 0; i <= len1; i++) matrix[i][0] = i;
        for (let j = 0; j <= len2; j++) matrix[0][j] = j;

        for (let i = 1; i <= len1; i++) {
            for (let j = 1; j <= len2; j++) {
                const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
                matrix[i][j] = Math.min(
                    matrix[i - 1][j] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j - 1] + cost
                );
            }
        }
        return matrix[len1][len2];
    }

    function calculateVolume(buffer) {
        let sumSq = 0;
        for (let i = 0; i < buffer.length; i++) {
            const sample = buffer[i];
            sumSq += sample * sample;
        }
        return Math.sqrt(sumSq / buffer.length);
    }

    function normalizeMusicName(filename) { return filename.replace(/\.mp4$/i, '').replace(/_/g, ' ').toLowerCase().trim(); }

    function findBestMatch(text, wordList, threshold = 2, normalizeFunc = null) {
        let bestMatch = null;
        let bestDistance = Infinity;
        const normalizedText = normalizeFunc ? normalizeFunc(text) : text;

        for (const word of wordList) {
            const normalizedWord = normalizeFunc ? normalizeFunc(word) : word;
            if (normalizedText.includes(normalizedWord) || normalizedWord.includes(normalizedText)) {
                return { word, distance: 0, found: true };
            }
        }

        for (const word of wordList) {
            const normalizedWord = normalizeFunc ? normalizeFunc(word) : word;

            const words = normalizedWord.split(' ');
            for (const w of words) {
                if (w.length < 2) continue;
                const distance = levenshteinDistance(normalizedText, w);
                if (distance < bestDistance) {
                    bestDistance = distance;
                    bestMatch = word;
                }
            }
            const fullDistance = levenshteinDistance(normalizedText, normalizedWord);
            if (fullDistance < bestDistance) {
                bestDistance = fullDistance;
                bestMatch = word;
            }
        }
        const found = bestDistance <= threshold;
        return { word: bestMatch, distance: bestDistance, found: found };
    }

    function nameCheck(text, words, threshold = 2) {
        const result = findBestMatch(text, words, threshold, null);
        return result.found;
    }

    function post_message(post, sender) {
        if (win && !win.isDestroyed()) {
            try {
                win.webContents.send('append-message', post, sender);
            } catch (err) {
                console.error('Ошибка post_message:', err.message);
            }
        }
    }
    function say(text) {
        if (!is_speak) {
            is_speak = true;
            const outputWav = '/tmp/jarvis_speech.wav';
            const ttsCommand = `echo "${text}" | RHVoice-test -o ${outputWav} -p 'aleksandr'`;

            exec(ttsCommand, () => {
                const playCommand = `aplay ${outputWav}`;
                exec(playCommand, () => {
                    is_speak = false;
                    fs.unlink(outputWav, () => { });
                });
            });
        }
    }

    function post_el(post) {
        let personalizedPost = post;
        personalizedPost = personalizedPost.replace("сэр", current_addressing_term);
        say(post)

        post_message(personalizedPost, 'system');
    }

    function post_command(post) {
        if (win && !win.isDestroyed()) {
            try {
                win.webContents.send('send-command', post);
            } catch (err) {
                console.error('Ошибка post_el:', err.message);
            }
        }
    }

    function applySettings(settings) {
        write_mode = settings.writeMode;
        current_volume_threshold = settings.volumeThreshold;

        current_addressing_term = settings.addressingTerm || 'сэр';

        let styleChange = false;
        if (current_core_style !== settings.coreStyle) {
            current_core_style = settings.coreStyle;
            styleChange = true;
        }
        if (current_bg_color !== settings.bgColor) {
            current_bg_color = settings.bgColor;
            styleChange = true;
        }
        if (current_core_size !== settings.coreSize) {
            current_core_size = settings.coreSize;
            styleChange = true;
        }

        let functionalChange = false;
        const newMusicPath = settings.musicPath ? settings.musicPath.replace(/^~/, os.homedir()) : DEFAULT_SETTINGS.musicPath;
        if (current_music_dir !== newMusicPath) {
            current_music_dir = newMusicPath;
            functionalChange = true;
        }

        current_app_keywords = settings.appKeywords || DEFAULT_SETTINGS.appKeywords;

        if (functionalChange) {
            updateMusicCache();
        }

        if (styleChange && win && !win.isDestroyed()) {
            win.webContents.send('apply-style-change', {
                coreStyle: current_core_style,
                bgColor: current_bg_color,
                coreSize: current_core_size
            });
        }
    }

    ipcMain.on('settings-data', (event, settings) => {
        applySettings(settings);
    });

    ipcMain.on('settings-request-initial', (event) => {
        event.reply('settings-send-initial', {
            writeMode: write_mode,
            volumeThreshold: current_volume_threshold,
            addressingTerm: current_addressing_term,
            coreStyle: current_core_style,
            bgColor: current_bg_color,
            coreSize: current_core_size,
            musicPath: current_music_dir,
            appKeywords: current_app_keywords
        });
    });

    ipcMain.on('settings-update', (event, newSettings) => {
        applySettings(newSettings);
        post_el("Настройки приложения обновлены.");
    });

    let musics = [];
    function updateMusicCache() {
        try {
            musics = count_files([".mp3", ".mp4", ".wav"], current_music_dir);
        } catch (err) {
            console.error('Ошибка обновления кэша музыки:', err);
            musics = [];
        }
    }
    updateMusicCache();
    const musicUpdateInterval = setInterval(updateMusicCache, 30000);

    // --- ОБНОВЛЕННЫЕ СПИСКИ КЛЮЧЕВЫХ СЛОВ ---
    const wake_words = ["чел", "джарвис", "бро", "алло"];
    const close_words = ["все", "достаточно", "хватит", "стоп", "прекрати"];
    const quit_words = ["до встречи", "досвидание", "покедо", "выйти"];
    const next_music_words = ["следующий", "дальше", "некст", "переключи"];
    const music_words = ["музыку", "песню", "трек", "заиграй"];
    const off_volume_words = ["тихо", "выключи звук", "заглуши"];
    const on_volume_words = ["музон", "включи звук", "верни звук"];
    const open_words = ["открой", "запусти", "включи", "покажи"];
    const write_mode_on_words = ["режим письма", "режим записи", "начинай писать"];
    const write_mode_off_words = ["прекрати", "остановись", "стоп"];
    const volume_set_words = ["громкость", "звук", "потише", "погромче", "на уровне"];
    const volume_max_words = ["макс", "на сто", "сто"];
    const volume_normal_words = ["нормальный", "средний", "пятьдесят"];
    const volume_music_words = ["для музыки", "семьдесят", "погнали"];
    const video_on_words = ['включи видео', 'покажи видео'];
    const video_off_words = ['выключи видео', 'скрой видео', 'только звук'];
    const say_time = ['скажи время', 'подскажи время'];
    const find_words = ['найди', 'исчи', 'поищи'];
    const help_words = ['об', 'о']

    function play_music(mode, text) {
        if (musics.length === 0) {
            post_el(`В папке ${path.basename(current_music_dir)} нет музыкальных файлов`);
            return;
        }

        if (mode === 0) {
            current_music = Math.floor(Math.random() * musics.length);
        } else if (mode === 1) {
            current_music = (current_music + 1) % musics.length;
        } else if (mode === 2) {
            current_music = current_music;
        } else if (mode === 3) {
            const parts = text.split(" ");
            const musicIndex = parts.findIndex(p => music_words.some(mw => p.includes(mw)));
            const searchQuery = (musicIndex !== -1 && musicIndex < parts.length - 1)
                ? parts.slice(musicIndex + 1).join(" ") : text;

            const result = findBestMatch(searchQuery, musics, 5, normalizeMusicName);
            if (result.found) {
                current_music = musics.indexOf(result.word);
            } else {
                post_el("Музыка не найдена");
                return;
            }
        }
        const music = path.join(current_music_dir, musics[current_music]);
        media(music, true);
    }

    function words_after_word(text, triggerWords) {
        const words = text.split(' ');

        for (let i = 0; i < words.length; i++) {
            const match = findBestMatch(words[i], triggerWords, 2);
            if (match.found) {
                const result = words.slice(i + 1).join(' ');
                return result || false;
            }
        }
        return false;
    }


    async function handleCommand(commandText) {
        if (nameCheck(commandText, close_words, 2)) {
            is_activated = false;
            if (player) {
                try { process.kill(player.pid, 'SIGTERM'); } catch (e) { }
                player = null;
            }
            post_el("ладно сэр");
            return true;
        }

        if (nameCheck(commandText, next_music_words, 2) && player) {
            return play_music(1, commandText);
        }

        if (nameCheck(commandText, write_mode_on_words, 3)) {
            write_mode = true;
            post_el("Режим записи включен. Говорите текст.");
            return true;
        }

        if (commandText.startsWith("напиши ")) {
            const textToWrite = commandText.substring("напиши ".length).trim();
            if (textToWrite) {
                write(textToWrite);
                post_el("Написал: " + textToWrite);
            } else {
                post_el("Что именно написать, сэр?");
            }
            return true;
        }

        if (nameCheck(commandText, music_words, 2)) {
            const parts = commandText.split(" ");
            let musicFound = false;
            for (const musicWord of music_words) {
                const index = parts.findIndex(p => nameCheck(p, [musicWord], 1));
                if (index !== -1 && index < parts.length - 1) {
                    const searchQuery = parts.slice(index + 1).join(" ");
                    play_music(3, searchQuery);
                    musicFound = true;
                    break;
                }
            }

            if (!musicFound) {
                if (!player) {
                    play_music(0, commandText);
                } else {
                    post_el("Продолжаю играть текущую музыку.");
                }
            }
            return true;
        }

        if (nameCheck(commandText, video_on_words, 2) && player) {
            open_video = true;
            play_music(2, commandText);
            post_el("Видео включено.");
            return true;
        }
        if (nameCheck(commandText, video_off_words, 2) && player) {
            open_video = false;
            play_music(2, commandText);
            post_el("Видео выключено, остался только звук.");
            return true;
        }

        if (nameCheck(commandText, open_words, 2)) {
            let launched = false;
            const appKeywords = Object.keys(current_app_keywords);
            const appMatch = findBestMatch(commandText, appKeywords, 2);

            if (appMatch.found) {
                const keyword = appMatch.word;
                const command = current_app_keywords[keyword];

                post_el(`Запускаю ${keyword} (${command})…`);
                exec(command, { detached: true, stdio: 'ignore' }, (err) => {
                    if (err) {
                        console.error(`Error launching ${keyword}: ${err.message}`);
                        post_el(`Ошибка при запуске ${keyword}. Проверьте команду: ${command}`);
                    }
                }).unref();

                launched = true;
            }

            return true;
        }

        if (nameCheck(commandText, find_words, 2)) {
            const query = words_after_word(commandText, help_words)?.replace(/^об\s+|^о\s+/, '')?.trim();
            if (!query) {
                post_el("Что именно нужно найти, сэр?");
                return true;
            }
            post_el(`Ищу информацию о ${query}…`);
            try {
                const result = await performWikipediaSearch(query);

                if (result.status === 'ok') {
                    post_el(result.summary);
                } else {
                    post_el(result.summary);
                }

            } catch (err) {
                post_el("Произошла ошибка при поиске информации.");
            }

            return true;
        }

        if (nameCheck(commandText, off_volume_words, 2)) {
            exec("pactl set-sink-mute @DEFAULT_SINK@ 1");
            post_el("Звук выключен.");
            return true;
        }
        if (nameCheck(commandText, on_volume_words, 2)) {
            exec("pactl set-sink-mute @DEFAULT_SINK@ 0");
            post_el("Звук включен.");
            return true;
        }

        if (nameCheck(commandText, volume_set_words, 2)) {
            let volume = 0;
            if (nameCheck(commandText, volume_max_words, 2)) volume = 100;
            else if (nameCheck(commandText, volume_normal_words, 2)) volume = 50;
            else if (nameCheck(commandText, volume_music_words, 2)) volume = 70;
            else {
                const match = commandText.match(/(\d+)/);
                if (match) {
                    volume = parseInt(match[1]);
                    volume = Math.max(0, Math.min(100, volume));
                }
            }

            if (volume > 0) {
                volume_regulate(volume);
                post_el(`Громкость установлена на ${volume}%.`);
                return true;
            }
        }
        if (nameCheck(commandText, say_time, 2)) {
            const time = new Date();
            say(`${time.getHours()} и ${time.getMinutes()}`)
            return true;
        }

        return false;
    }


    input.on('data', async chunk => {
        const audioBuffer = new Int16Array(chunk.buffer);
        const volume = calculateVolume(audioBuffer);

        if (volume < current_volume_threshold) return;

        const text = stt.recognize(audioBuffer);
        if (!text) return;

        const lowertext = text.toLowerCase();
        post_message(lowertext, 'user');

        if (nameCheck(lowertext, quit_words, 2)) {
            post_el("До встречи сэр");
            clearInterval(musicUpdateInterval);
            if (player) try { process.kill(player.pid, 'SIGTERM'); } catch (e) { }
            process.exit(0);
        }

        if (write_mode) {
            if (nameCheck(lowertext, write_mode_off_words, 2)) {
                write_mode = false;
                post_el("Режим записи выключен");
                return;
            }
            write(lowertext);
            return;
        }

        let wordsAfterWake = null;

        const isWakeWordPresent = nameCheck(lowertext, wake_words, 2);

        if (isWakeWordPresent) {
            clearTimeout(activationTimer);
            is_activated = true;

            activationTimer = setTimeout(() => {
                if (is_activated) {
                    post_el("Ожидание команды завершено.");
                    is_activated = false;
                }
            }, ACTIVATION_TIMEOUT);

            post_el("Слушаю.");

            wordsAfterWake = lowertext.split(" ").slice(1).join(" ").trim();
        }

        let commandToExecute = '';

        if (isWakeWordPresent && wordsAfterWake) {
            commandToExecute = wordsAfterWake;
        } else if (is_activated && !isWakeWordPresent) {
            commandToExecute = lowertext;
        } else {
            return;
        }

        if (commandToExecute) {
            clearTimeout(activationTimer);
            activationTimer = setTimeout(() => {
                if (is_activated) {
                    post_el("Ожидание команды завершено.");
                    is_activated = false;
                }
            }, ACTIVATION_TIMEOUT);

            await handleCommand(commandToExecute);
        }
    });

    micInstance.start();

    post_el("жду вашего запроса");
};