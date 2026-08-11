#include "audio/TtsStub.h"

#include <cmath>

#include "core/Logger.h"

namespace aj {

bool TtsStub::init(const Config& cfg) {
    (void)cfg;
    logInfo("TtsStub: מצב הדגמה — צפצוף במקום דיבור");
    return true;
}

std::vector<float> TtsStub::synthesize(const std::string& text, int& outSampleRate) {
    outSampleRate = 16000;
    // צפצוף "דיבור": שני טונים קצרים (משך פרופורציונלי לאורך הטקסט)
    const double secs = std::clamp(0.15 + text.size() * 0.004, 0.2, 1.5);
    const size_t n = static_cast<size_t>(outSampleRate * secs);
    std::vector<float> out;
    out.reserve(n);
    for (size_t i = 0; i < n; ++i) {
        double t = static_cast<double>(i) / outSampleRate;
        double freq = 660.0 + 110.0 * std::sin(2.0 * 3.14159265 * 3.0 * t);
        double env = std::min(1.0, t * 20.0) * std::min(1.0, (secs - t) * 20.0);
        out.push_back(static_cast<float>(0.25 * env * std::sin(2.0 * 3.14159265 * freq * t)));
    }
    return out;
}

} // namespace aj
