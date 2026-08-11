// =============================================================================
//  Adiel Junior — SttStub
//  זיהוי דיבור הדגמה: מדמה תמלול (לבדיקות ללא מודל whisper).
// =============================================================================
#pragma once

#include "audio/IStt.h"

namespace aj {

class SttStub final : public IStt {
public:
    bool init(const Config& cfg) override;
    bool ready() const override { return true; }
    std::string transcribe(const float* samples, size_t count) override;
    std::string name() const override { return "SttStub (הדגמה)"; }
};

} // namespace aj
