// =============================================================================
//  Adiel Junior — IScreenSource
//  מקור מסך חי: DXGI Desktop Duplication (Windows) / Stub (פיתוח).
// =============================================================================
#pragma once

#include <cstdint>
#include <memory>
#include <string>
#include <vector>

namespace aj {

struct Config;

// פריים BGRA8 יחיד שנתפס מהמסך
struct Frame {
    int width = 0;
    int height = 0;
    int stride = 0;              // בתים לשורה
    std::vector<uint8_t> pixels; // BGRA8
    uint64_t timestampMs = 0;
    bool empty = true;

    uint8_t* row(int y) { return pixels.data() + static_cast<size_t>(y) * stride; }
    const uint8_t* row(int y) const { return pixels.data() + static_cast<size_t>(y) * stride; }
};

class IScreenSource {
public:
    virtual ~IScreenSource() = default;

    // הפעלת לכידת מסך (חוט פנימי). מחזיר false אם אין אפשרות ללכוד.
    virtual bool start() = 0;
    virtual void stop() = 0;

    // לכידת פריים בודד (חוסם עד timeoutMs). מחזיר nullptr אם אין פריים חדש.
    virtual std::shared_ptr<Frame> capture(int timeoutMs) = 0;

    virtual int width() const = 0;
    virtual int height() const = 0;
    virtual std::string name() const = 0;
};

// מפעל פלטפורמתי: DXGI (Windows) / Stub (פיתוח)
IScreenSource* createScreenSource(const Config& cfg);

} // namespace aj
