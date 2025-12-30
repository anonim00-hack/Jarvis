const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os'); // Добавлено, так как используется в app.js

let mainWindow;
let settingsWindow = null;

// ---------------------- SETTINGS CONFIGURATION ----------------------

const SETTINGS_FILE_PATH = path.join(__dirname, '/interface/setting/setting.json');

const DEFAULT_SETTINGS = {
    writeMode: false,
    volumeThreshold: 20,
    addressingTerm: 'сэр', 
    coreStyle: 'quantum-lock',
    bgColor: 'default',
    coreSize: 'medium',
    musicPath: '~/Музыка/funks',
    appKeywords: {
        "ютуб": 'firefox https://youtube.com',
        "телеграм": 'Telegram',
        "код": 'code .',
        "браузер": 'firefox',
        "терминал": 'kgx -- zsh'
    }
};
let currentSettings = readSettings();

function writeSettings(settings) {
    try {
        const data = JSON.stringify(settings, null, 2);
        fs.writeFileSync(SETTINGS_FILE_PATH, data, 'utf8');
    } catch (error) {
        console.error("Error writing settings file:", error);
    }
}

function readSettings() {
    try {
        if (fs.existsSync(SETTINGS_FILE_PATH)) {
            const data = fs.readFileSync(SETTINGS_FILE_PATH, 'utf8').trim();
            
            if (!data) {
                console.warn("Settings file exists but is empty. Using default settings.");
                return DEFAULT_SETTINGS;
            }
            
            const savedSettings = JSON.parse(data); 

            // ИСПРАВЛЕНИЕ 1: Гарантируем, что порог громкости является числом.
            if (savedSettings.volumeThreshold !== undefined) {
                savedSettings.volumeThreshold = parseInt(savedSettings.volumeThreshold, 10);
            }

            return { ...DEFAULT_SETTINGS, ...savedSettings }; 
        }
    } catch (error) {
        console.error("Error reading settings file. Restoring defaults:", error.message);
        writeSettings(DEFAULT_SETTINGS); 
        return DEFAULT_SETTINGS;
    }
    return DEFAULT_SETTINGS;
}

// ---------------------- WINDOW MANAGEMENT ----------------------

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 800,
    title: "Jarvis",
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    show: false,
    frame: false
  });

  mainWindow.loadFile(path.join(__dirname, 'interface/index.html'));
  
  mainWindow.once('ready-to-show', () => {
      mainWindow.show();
      // Отправляем начальные настройки в index.html для визуального стиля
      if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('apply-visual-settings', currentSettings);
      }
  });

  // ИСПРАВЛЕНИЕ 2: Передаем currentSettings в модуль app.js для инициализации всех переменных
  require('./codes/app.js')(mainWindow, currentSettings);
}

function createSettingsWindow() {
    if (settingsWindow) {
        settingsWindow.focus();
        return;
    }

    settingsWindow = new BrowserWindow({
        width: 600,
        height: 800,
        title: 'JARVIS Settings',
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        parent: mainWindow,
        modal: false,
        show: false,
        backgroundColor: '#0a0a12'
    });

    settingsWindow.loadFile(path.join(__dirname, '/interface/setting/setting.html')); 

    settingsWindow.once('ready-to-show', () => {
        settingsWindow.show();
    });

    settingsWindow.on('closed', () => {
        settingsWindow = null;
    });
}

// ---------------------- APPLICATION LIFECYCLE ----------------------

app.whenReady().then(createMainWindow);

app.on('window-all-closed', () => {
  setTimeout(() => {
    if (process.platform !== 'darwin') app.quit();
  }, 200);
});

app.on('before-quit', () => {
  app.isQuitting = true; 
});

ipcMain.on('open-setting', createSettingsWindow);

ipcMain.on('settings-request-initial', (event) => {
    event.reply('settings-send-initial', currentSettings); 
});

ipcMain.on('settings-update', (event, newSettings) => {
    currentSettings = newSettings; 
    
    writeSettings(newSettings); 
    
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('apply-visual-settings', newSettings);
        mainWindow.webContents.send('settings-data', newSettings); // Используем settings-data для app.js
    }
});

ipcMain.on('settings-reset-to-default', (event) => {
    currentSettings = DEFAULT_SETTINGS;
    writeSettings(DEFAULT_SETTINGS);
    
    event.reply('settings-send-initial', currentSettings); 

    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('apply-visual-settings', currentSettings);
        mainWindow.webContents.send('settings-data', currentSettings); // Отправка сброшенных настроек в app.js
    }
});