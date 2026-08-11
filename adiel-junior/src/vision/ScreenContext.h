// =============================================================================
//  Adiel Junior — ScreenContext
//  בונה "הקשר מסך" טקסטואלי עבור ה-AI:
//   - כותרת החלון הפעיל + שם התהליך (Win32)
//   - OCR מקורי של Windows (Windows.Media.Ocr) — כולל עברית
//  כך שה-AI "רואה" את המסך גם בלי מודל Vision יקר.
// =============================================================================
#pragma once

#include <string>

#include "core/Config.h"
#include "vision/IScreenSource.h"

namespace aj {

struct ScreenSnapshot {
    std::string windowTitle;   // כותרת החלון הפעיל
    std::string processName;   // שם התהליך (chrome.exe, explorer.exe...)
    std::string ocrText;       // טקסט שנקרא מהמסך
    int width = 0, height = 0;

    bool empty() const { return windowTitle.empty() && ocrText.empty(); }
};

class ScreenContext {
public:
    explicit ScreenContext(const Config& cfg);

    // האם מנוע ה-OCR זמין בפלטפורמה זו
    static bool ocrAvailable();

    // אוסף הקשר מסך: כותרת חלון (+ OCR של אזור השינוי אם ביקשו)
    ScreenSnapshot build(const std::shared_ptr<Frame>& frame,
                         bool doOcr,
                         int regionX = 0, int regionY = 0,
                         int regionW = 0, int regionH = 0);

private:
    std::string activeWindowTitle();
    std::string activeProcessName();
    std::string ocrRegion(const Frame& frame, int x, int y, int w, int h);

    bool m_ocrEnabled = true;
};

} // namespace aj
