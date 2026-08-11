#include "vision/StubScreenSource.h"

#include <chrono>
#include <thread>

namespace aj {

namespace {
constexpr int kW = 1920;
constexpr int kH = 1080;
}

std::shared_ptr<Frame> StubScreenSource::capture(int timeoutMs) {
    if (!m_running.load()) return nullptr;

    // דמה קצב לכידה
    std::this_thread::sleep_for(std::chrono::milliseconds(timeoutMs));

    auto frame = std::make_shared<Frame>();
    frame->width = kW;
    frame->height = kH;
    frame->stride = kW * 4;
    frame->pixels.assign(static_cast<size_t>(kW) * kH * 4, 0);
    frame->timestampMs = m_frameNo++;

    const uint32_t t = static_cast<uint32_t>(m_frameNo);

    // רקע גרדיאנט נע
    for (int y = 0; y < kH; ++y) {
        uint8_t* row = frame->row(y);
        for (int x = 0; x < kW; ++x) {
            uint8_t b = static_cast<uint8_t>((x / 8 + y / 8 + t / 4) & 0xFF);
            row[x * 4 + 0] = b;
            row[x * 4 + 1] = static_cast<uint8_t>(b / 2);
            row[x * 4 + 2] = static_cast<uint8_t>(255 - b / 2);
            row[x * 4 + 3] = 255;
        }
    }

    // "חלון פעיל" — מלבן נע עם פסים דמויי טקסט
    int wx = 400 + static_cast<int>((t * 3) % 800);
    int wy = 250 + static_cast<int>((t * 2) % 400);
    for (int y = wy; y < wy + 240; ++y) {
        if (y < 0 || y >= kH) continue;
        uint8_t* row = frame->row(y);
        for (int x = wx; x < wx + 640; ++x) {
            if (x < 0 || x >= kW) continue;
            bool line = ((x - wx) / 12) % 2 == 0; // דמוי טקסט
            row[x * 4 + 0] = line ? 40 : 200;
            row[x * 4 + 1] = line ? 200 : 40;
            row[x * 4 + 2] = line ? 90 : 90;
        }
    }

    frame->empty = false;
    return frame;
}

#ifndef _WIN32
// מפעל לינוקס/בדיקות: מקור מדומה
IScreenSource* createScreenSource(const Config&) {
    return new StubScreenSource();
}
#endif

} // namespace aj
