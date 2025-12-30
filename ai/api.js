const fetch = require('node-fetch');

/**
 * Функция, которая отправляет запрос к Wikipedia API для получения определения.
 * @param {string} query Запрос пользователя.
 * @returns {Promise<object>} Промис, который возвращает объект со структурированными данными.
 */
async function performWikipediaSearch(query) {
    const url = `https://ru.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`;
    
    try {
        const response = await fetch(url);
        
        if (response.status === 404) {
             return {
                query: query,
                status: 'not_found',
                source: 'Wikipedia API',
                summary: `Не найдено статьи для "${query}".`
            };
        }
        
        if (!response.ok) {
            throw new Error(`HTTP Error: ${response.status}`);
        }

        const data = await response.json();
        
        return {
            query: query,
            status: 'ok',
            source: 'Wikipedia API',
            summary: data.extract || "Краткое содержание недоступно."
        };

    } catch (error) {
        return {
            query: query,
            status: 'error',
            source: 'Wikipedia API',
            summary: `Произошла сетевая ошибка: ${error.message}`
        };
    }
}

// Экспортируем функцию, чтобы ее можно было использовать в других файлах
module.exports = {
    performWikipediaSearch
};


// --- ДЕМОНСТРАЦИОННЫЙ ЦИКЛ (Остается для тестирования этого файла) ---
if (require.main === module) {
    const readline = require('readline');
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    function searchLoop() {
        rl.question(`\n🔍 Введите поисковый запрос (или 'выход' для завершения): `, async (query) => {
            
            if (query.toLowerCase() === 'выход') {
                console.log("\n👋 Завершение работы.");
                rl.close();
                return;
            }

            console.log(`\n🤖 Выполняем поиск в Wikipedia по запросу: "${query}"...`);
            const searchData = await performWikipediaSearch(query);

            let processedResult = `*** Обработка Вашим Ботом ***\n`;
            processedResult += `✅ Информация получена (Источник: ${searchData.source}).\n`;
            processedResult += `💬 Ответ для озвучивания: ${searchData.summary}`;
            
            console.log("-----------------------------------------------------");
            console.log(processedResult);
            console.log("-----------------------------------------------------");

            searchLoop();
        });
    }

    console.log("=========================================");
    console.log("   ИНТЕРАКТИВНЫЙ ПОИСКОВИК (Wikipedia)   ");
    console.log("=========================================");
    searchLoop();
}