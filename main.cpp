#include "raylib.h"
#include <cmath>
#include <cstdlib>
#include <ctime>
#include <vector>

#define WIDTH 1200
#define HEIGHT 1000

Color colors[] = {
    RED, BLUE, PURPLE, GOLD, WHITE, PINK, VIOLET, ORANGE, {20, 60, 200}};

class Particle
{
  private:
    float randomF(float min, float max)
    {
        return min + (float)rand() / ((float)RAND_MAX / (max - min));
    }

  public:
    float x, y, velX, velY;
    Color color;
    int radius = 10;

    void giveAttr()
    {
        x = randomF(radius, WIDTH - radius);
        y = randomF(radius, HEIGHT - radius);
        color = colors[rand() % 9];
        velX = randomF(-5.0f, 5.0f);
        velY = randomF(-5.0f, 5.0f);
    }

    void updateAndDraw()
    {
        velX *= 0.99f;
        velY *= 0.99f;
        x += velX;
        y += velY;

        if (x - radius <= 0)
        {
            x = radius;
            velX *= -1.0f;
        } else if (x + radius >= WIDTH)
        {
            x = WIDTH - radius;
            velX *= -1.0f;
        }
        if (y - radius <= 0)
        {
            y = radius;
            velY *= -1.0f;
        } else if (y + radius >= HEIGHT)
        {
            y = HEIGHT - radius;
            velY *= -1.0f;
        }

        float diffX = x - GetMouseX();
        float diffY = y - GetMouseY();
        if (fabsf(diffX) < 100 && fabsf(diffY) < 100)
        {
            velX += diffX * 0.01f;
            velY += diffY * 0.01f;
        }

        DrawCircle((int)x, (int)y, radius, color);
    }
};

int main()
{
    srand(time(NULL));
    InitWindow(WIDTH, HEIGHT, "title");
    SetTargetFPS(120);

    std::vector<Particle> p;

    for (int i = 0; i < 100; i++)
    {
        Particle newP;
        newP.giveAttr();
        p.push_back(newP);
    }

    while (!WindowShouldClose())
    {
        if (IsMouseButtonDown(MOUSE_LEFT_BUTTON))
        {
            Particle newP;
            newP.giveAttr();
            newP.x = GetMouseX();
            newP.y = GetMouseY();
            p.push_back(newP);
        }

        BeginDrawing();
        DrawRectangle(0, 0, WIDTH, HEIGHT, {20, 20, 20, 20});

        for (auto &el : p)
        {
            el.updateAndDraw();
        }

        DrawText(TextFormat("Particles: %i", p.size()), 10, 10, 20, WHITE);
        EndDrawing();
    }

    CloseWindow();
    return 0;
}