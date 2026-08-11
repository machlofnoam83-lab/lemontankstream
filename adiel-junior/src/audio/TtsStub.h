// =============================================================================
//  Adiel Junior — TtsStub
//  דיבור הדגמה ללא מודל: מצפצף קצר (עוזר לבדוק את הצינור הקולי כולו).
// =============================================================================
#pragma once

#include "audio/ITts.h"

namespace aj {

class TtsStub final : public TtsBase {
public:
    bool init(const Config& cfg) override;
    bool ready() const override { return true; }
    std::string name() const override { return "TtsStub (הדגמה)"; }

protected:
    std::vector<float> synthesize(const std::string& text, int& outSampleRate) override;
};

} // namespace aj
