// =============================================================================
//  Adiel Junior — gen_icon
//  מחולל לוגו הולוגרפי (טבעת אנרגיה + "A") — C++ טהור, ללא תלות חיצונית.
//  פלט: assets/adieljunior.ico (לחלון/קובץ) + assets/adieljunior.bmp (תצוגה מקדימה)
//
//  בנייה:  g++ -O2 -std=c++20 tools/gen_icon.cpp -o gen_icon && ./gen_icon
// =============================================================================
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <string>
#include <vector>

namespace {

// מבני BMP/ICO מוגדרים ידנית — ניידות מלאה (ללא windows.h)
#pragma pack(push, 1)
struct BmpFileHeader {
    uint16_t bfType;
    uint32_t bfSize;
    uint16_t bfReserved1;
    uint16_t bfReserved2;
    uint32_t bfOffBits;
};
struct BmpInfoHeader {
    uint32_t biSize;
    int32_t biWidth;
    int32_t biHeight;
    uint16_t biPlanes;
    uint16_t biBitCount;
    uint32_t biCompression;
    uint32_t biSizeImage;
    int32_t biXPelsPerMeter;
    int32_t biYPelsPerMeter;
    uint32_t biClrUsed;
    uint32_t biClrImportant;
};
#pragma pack(pop)

constexpr int kSize = 256;

struct Pixel { uint8_t b, g, r, a; };

struct Canvas {
    std::vector<Pixel> px;
    Canvas() : px(static_cast<size_t>(kSize) * kSize, Pixel{0, 0, 0, 0}) {}

    Pixel& at(int x, int y) { return px[static_cast<size_t>(y) * kSize + x]; }

    void blend(int x, int y, uint8_t r, uint8_t g, uint8_t b, float alpha) {
        if (x < 0 || y < 0 || x >= kSize || y >= kSize) return;
        if (alpha <= 0.0f) return;
        if (alpha > 1.0f) alpha = 1.0f;
        Pixel& p = at(x, y);
        float da = static_cast<float>(p.a) / 255.0f;
        float outA = alpha + da * (1.0f - alpha);
        if (outA <= 0.0f) return;
        p.r = static_cast<uint8_t>((static_cast<float>(r) * alpha + static_cast<float>(p.r) * da * (1.0f - alpha)) / outA);
        p.g = static_cast<uint8_t>((static_cast<float>(g) * alpha + static_cast<float>(p.g) * da * (1.0f - alpha)) / outA);
        p.b = static_cast<uint8_t>((static_cast<float>(b) * alpha + static_cast<float>(p.b) * da * (1.0f - alpha)) / outA);
        p.a = static_cast<uint8_t>(outA * 255.0f);
    }

    // עיגול (מילוי או טבעת עם אנטי-aliasing)
    void circle(float cx, float cy, float r, uint8_t cr, uint8_t cg, uint8_t cb, float alpha,
                float ringW = 0.0f) {
        int x0 = static_cast<int>(cx - r - 2), x1 = static_cast<int>(cx + r + 2);
        int y0 = static_cast<int>(cy - r - 2), y1 = static_cast<int>(cy + r + 2);
        for (int y = y0; y <= y1; ++y) {
            for (int x = x0; x <= x1; ++x) {
                float d = std::sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy));
                if (ringW <= 0.0f) {
                    if (d <= r) blend(x, y, cr, cg, cb, alpha);
                } else {
                    float inner = r - ringW;
                    if (d <= r && d >= inner) {
                        float a = alpha * std::min(1.0f, std::min(r - d, d - inner) + 0.5f);
                        blend(x, y, cr, cg, cb, a);
                    }
                }
            }
        }
    }

    // קשת (קטע טבעת)
    void arc(float cx, float cy, float r, float ringW, float a0, float a1,
             uint8_t cr, uint8_t cg, uint8_t cb, float alpha) {
        int x0 = static_cast<int>(cx - r - 2), x1 = static_cast<int>(cx + r + 2);
        int y0 = static_cast<int>(cy - r - 2), y1 = static_cast<int>(cy + r + 2);
        for (int y = y0; y <= y1; ++y) {
            for (int x = x0; x <= x1; ++x) {
                float dx = x - cx, dy = y - cy;
                float d = std::sqrt(dx * dx + dy * dy);
                if (d > r || d < r - ringW) continue;
                float ang = std::atan2(dy, dx);
                if (ang < 0) ang += 6.2831853f;
                if (ang >= a0 && ang <= a1) {
                    float a = alpha * std::min(1.0f, std::min(r - d, d - (r - ringW)) + 0.5f);
                    blend(x, y, cr, cg, cb, a);
                }
            }
        }
    }

    // קו עבה עם אנטי-aliasing פשוט
    void line(float x0, float y0, float x1, float y1, float w,
              uint8_t cr, uint8_t cg, uint8_t cb, float alpha) {
        float dx = x1 - x0, dy = y1 - y0;
        float len = std::sqrt(dx * dx + dy * dy);
        if (len < 1e-4f) return;
        dx /= len; dy /= len;
        float nx = -dy, ny = dx;
        int steps = static_cast<int>(len * 2);
        for (int i = 0; i <= steps; ++i) {
            float t = static_cast<float>(i) / static_cast<float>(steps);
            float px = x0 + dx * t * len;
            float py = y0 + dy * t * len;
            // רוחב הקו — ריבועים קטנים
            int hw = static_cast<int>(w / 2) + 1;
            for (int oy = -hw; oy <= hw; ++oy) {
                for (int ox = -hw; ox <= hw; ++ox) {
                    float d = std::sqrt(static_cast<float>(ox * ox + oy * oy));
                    if (d <= w / 2) {
                        float a = alpha * std::min(1.0f, w / 2 - d + 0.5f);
                        blend(static_cast<int>(px + nx * ox), static_cast<int>(py + ny * oy),
                              cr, cg, cb, a);
                    }
                }
            }
        }
    }
};

// ---------------------------------------------------------------------------
//  כתיבה: BMP (32-bit BGRA top-down) + ICO (עם ערך BMP)
// ---------------------------------------------------------------------------
void writeBmp(const std::string& path, const Canvas& c) {
    std::FILE* f = std::fopen(path.c_str(), "wb");
    if (!f) return;
    constexpr int rowSize = kSize * 4;
    constexpr int dataSize = rowSize * kSize;

    BmpFileHeader bfh{};
    bfh.bfType = 0x4D42; // "BM"
    bfh.bfOffBits = sizeof(BmpFileHeader) + sizeof(BmpInfoHeader);
    bfh.bfSize = bfh.bfOffBits + dataSize;
    std::fwrite(&bfh, sizeof(bfh), 1, f);

    BmpInfoHeader bih{};
    bih.biSize = sizeof(bih);
    bih.biWidth = kSize;
    bih.biHeight = kSize; // top-down
    bih.biPlanes = 1;
    bih.biBitCount = 32;
    bih.biCompression = 0; // BI_RGB
    bih.biSizeImage = dataSize;
    std::fwrite(&bih, sizeof(bih), 1, f);

    // BGRA rows (top-down)
    std::vector<uint8_t> row(static_cast<size_t>(rowSize));
    for (int y = 0; y < kSize; ++y) {
        for (int x = 0; x < kSize; ++x) {
            const Pixel& p = c.px[static_cast<size_t>(y) * kSize + x];
            row[static_cast<size_t>(x) * 4 + 0] = p.b;
            row[static_cast<size_t>(x) * 4 + 1] = p.g;
            row[static_cast<size_t>(x) * 4 + 2] = p.r;
            row[static_cast<size_t>(x) * 4 + 3] = p.a;
        }
        std::fwrite(row.data(), 1, row.size(), f);
    }
    std::fclose(f);
    std::printf("נכתב: %s\n", path.c_str());
}

void writeIco(const std::string& path, const Canvas& c) {
    std::FILE* f = std::fopen(path.c_str(), "wb");
    if (!f) return;
    constexpr int dataSize = kSize * kSize * 4;
    constexpr int bmpSize = sizeof(BmpInfoHeader) + dataSize;

    // כותרת ICO
    uint16_t reserved = 0, type = 1, count = 1;
    std::fwrite(&reserved, 2, 1, f);
    std::fwrite(&type, 2, 1, f);
    std::fwrite(&count, 2, 1, f);

    // רשומת תמונה (256 = 0 בפועל)
    uint8_t w = 0, h = 0, colors = 0, rsv = 0;
    uint16_t planes = 1, bitCount = 32;
    uint32_t size = bmpSize, offset = 6 + 16;
    std::fwrite(&w, 1, 1, f);
    std::fwrite(&h, 1, 1, f);
    std::fwrite(&colors, 1, 1, f);
    std::fwrite(&rsv, 1, 1, f);
    std::fwrite(&planes, 2, 1, f);
    std::fwrite(&bitCount, 2, 1, f);
    std::fwrite(&size, 4, 1, f);
    std::fwrite(&offset, 4, 1, f);

    // BITMAPINFOHEADER (גובה כפול — כולל AND mask)
    BmpInfoHeader bih{};
    bih.biSize = sizeof(bih);
    bih.biWidth = kSize;
    bih.biHeight = kSize * 2;
    bih.biPlanes = 1;
    bih.biBitCount = 32;
    bih.biCompression = 0; // BI_RGB
    bih.biSizeImage = dataSize;
    std::fwrite(&bih, sizeof(bih), 1, f);

    // פיקסלים BGRA bottom-up (ICO דורש bottom-up)
    std::vector<uint8_t> row(static_cast<size_t>(kSize * 4));
    for (int y = kSize - 1; y >= 0; --y) {
        for (int x = 0; x < kSize; ++x) {
            const Pixel& p = c.px[static_cast<size_t>(y) * kSize + x];
            row[static_cast<size_t>(x) * 4 + 0] = p.b;
            row[static_cast<size_t>(x) * 4 + 1] = p.g;
            row[static_cast<size_t>(x) * 4 + 2] = p.r;
            row[static_cast<size_t>(x) * 4 + 3] = p.a;
        }
        std::fwrite(row.data(), 1, row.size(), f);
    }
    // AND mask (1bpp, חובה בקובצי ICO) — הכל 0 (שקיפות מלאה ב-alpha)
    const size_t andRow = ((kSize + 31) / 32) * 4;
    std::vector<uint8_t> mask(andRow, 0);
    for (int y = 0; y < kSize; ++y) std::fwrite(mask.data(), 1, mask.size(), f);

    std::fclose(f);
    std::printf("נכתב: %s\n", path.c_str());
}

} // namespace

int main() {
    Canvas c;
    const float cx = 128.0f, cy = 128.0f;

    // זוהר חיצוני רך
    for (int y = 0; y < kSize; ++y) {
        for (int x = 0; x < kSize; ++x) {
            float d = std::sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy));
            float glow = std::max(0.0f, 1.0f - d / 110.0f);
            glow = glow * glow * 0.35f;
            if (glow > 0.01f) c.blend(x, y, 0, 229, 255, glow);
        }
    }

    // טבעת ראשית
    c.circle(cx, cy, 92.0f, 0, 229, 255, 0.95f, 9.0f);
    // טבעת פנימית דקה
    c.circle(cx, cy, 76.0f, 120, 240, 255, 0.45f, 2.0f);

    // קשתות מבטא מסתובבות
    c.arc(cx, cy, 92.0f, 9.0f, -0.6f, 1.2f, 255, 255, 255, 0.9f);
    c.arc(cx, cy, 92.0f, 9.0f, 3.4f, 4.6f, 0, 229, 255, 0.7f);

    // נקודות על הטבעת
    for (int i = 0; i < 8; ++i) {
        float a = 6.2831853f * static_cast<float>(i) / 8.0f;
        c.circle(cx + std::cos(a) * 92.0f, cy + std::sin(a) * 92.0f, 3.0f, 255, 255, 255, 0.9f);
    }

    // ליבה כהה
    c.circle(cx, cy, 58.0f, 6, 18, 34, 0.96f);

    // האות "A" בסגנון הולוגרפי
    const float lw = 11.0f;
    c.line(cx - 34, cy + 34, cx, cy - 36, lw, 0, 229, 255, 0.95f); // רגל שמאל
    c.line(cx + 34, cy + 34, cx, cy - 36, lw, 0, 229, 255, 0.95f); // רגל ימין
    c.line(cx - 18, cy + 6, cx + 18, cy + 6, 7.0f, 140, 246, 255, 0.9f); // פס אמצע

    // נקודה מרכזית זוהרת
    c.circle(cx, cy - 10, 7.0f, 255, 255, 255, 0.95f);

    writeBmp("assets/adieljunior.bmp", c);
    writeIco("assets/adieljunior.ico", c);
    std::printf("הלוגו נוצר בהצלחה!\n");
    return 0;
}
