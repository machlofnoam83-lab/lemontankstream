// =============================================================================
//  Adiel Junior — IAudioSource
//  מקור אודיו מהמיקרופון: 16kHz מונו float32 (תקן אחיד לכל המנועים).
// =============================================================================
#pragma once

#include <cstddef>
#include <cstdint>
#include <functional>
#include <string>
#include <vector>

namespace aj {

class IAudioSource {
public:
    using Callback = std::function<void(const float* samples, size_t count)>;

    virtual ~IAudioSource() = default;

    // מתחיל לכידה בחוט פנימי; כל חתיכת שמע (16kHz מונו float) → callback
    virtual bool start(Callback cb) = 0;
    virtual void stop() = 0;

    virtual int sampleRate() const = 0;   // תמיד 16000 אחרי ההמרה
    virtual std::string deviceName() const = 0;
};

// פונקציית עזר: המרת WAVEFORMAT כלשהו ל-16kHz מונו float
void convertToMono16k(const float* in, size_t frames, int inChannels, int inRate,
                      std::vector<float>& out);

} // namespace aj
