// =============================================================================
//  Adiel Junior — IStt
//  ממשק אחיד לזיהוי דיבור (Whisper.cpp / Stub).
// =============================================================================
#pragma once

#include <cstddef>
#include <string>

#include "core/Config.h"

namespace aj {

class IStt {
public:
    virtual ~IStt() = default;

    // טוען את מודל ה-STT
    virtual bool init(const Config& cfg) = 0;
    virtual bool ready() const = 0;

    // מתמלל חתיכת שמע (16kHz מונו float32). חוסם.
    virtual std::string transcribe(const float* samples, size_t count) = 0;

    virtual std::string name() const = 0;
};

// מפעל לפי cfg.sttEngine
IStt* createSttEngine(const Config& cfg);

} // namespace aj
