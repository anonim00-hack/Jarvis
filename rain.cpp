#include "raylib.h"
#include "raymath.h"
#include <vector>

#define WIDTH 1000
#define HEIGHT 800

class RainDrop {
public:
    float x, y;
    float speed;
    float length;
    float thick;
    Color color;

    void reset(bool randomY = true) {
        x = GetRandomValue(0, WIDTH);
        // Если randomY = true (при старте), разбрасываем по всему экрану
        // Если false (во время работы), создаем чуть выше верхней границы
        y = randomY ? GetRandomValue(0, HEIGHT) : GetRandomValue(-100, -20);
        
        // Параллакс: чем быстрее капля, тем она толще и длиннее (эффект близости)
        speed = (float)GetRandomValue(4, 8); 
        length = speed * 1.2f;
        thick = speed / 5.0f;
        
        // Цвет: легкий голубой с прозрачностью. 
        // Быстрые капли (ближние) — ярче, медленные (дальние) — тусклее.
        unsigned char alpha = (unsigned char)Remap(speed, 8, 14, 40, 180);
        color = { 170, 200, 255, alpha };
    }

    void update() {
        y += speed; // Только движение вниз для чистого дождя

        // Если капля улетела за нижний край
        if (y > HEIGHT + length) {
            reset(false);
        }
    }

    void draw() {
        // Рисуем каплю как тонкую линию
        DrawLineEx({x, y}, {x, y + length}, thick, color);
    }
};

int main() {
    // Настройка сглаживания (MSAA) для более плавных линий
    SetConfigFlags(FLAG_MSAA_4X_HINT);
    InitWindow(WIDTH, HEIGHT, "Calm Rain");
    SetTargetFPS(120);

    const int count = 500;
    std::vector<RainDrop> rain(count);

    for (int i = 0; i < count; i++) {
        rain[i].reset(true);
    }

    while (!WindowShouldClose()) {
        // Обновление
        for (int i = 0; i < count; i++) {
            rain[i].update();
        }

        // Отрисовка
        BeginDrawing();
        // Глубокий мягкий цвет ночи
        ClearBackground({15, 15, 25, 255});

        // Добавляем очень легкий шлейф (Motion Blur)
        DrawRectangle(0, 0, WIDTH, HEIGHT, {15, 15, 25, 50});

        for (int i = 0; i < count; i++) {
            rain[i].draw();
        }

        EndDrawing();
    }

    CloseWindow();
    return 0;
}