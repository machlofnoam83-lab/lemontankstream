// =============================================================================
//  Adiel Junior — FrameDiffer
//  זיהוי שינויים דינמי: דגימת רשת תאים (grid) מהפריים וחישוב אחוז השינוי.
//  ה-AI הוויזואלי מופעל רק כשהשינוי משמעותי (חיסכון ב-CPU).
// =============================================================================
#pragma once

#include <cstdint>
#include <vector>

#include "vision/IScreenSource.h"

namespace aj {

class FrameDiffer {
public:
    explicit FrameDiffer(int gridW = 64, int gridH = 36);

    // משווה פריים חדש לישן. מחזיר את אחוז התאים ששונו [0..1].
    // מעדכן את התמונה הפנימית. frame==nullptr → מאפס.
    double diff(const std::shared_ptr<Frame>& frame);

    // אחוז השינוי האחרון
    double lastRatio() const { return m_lastRatio; }

    // שטח השינוי (בפיקסלי מקור) — להעברה ל-OCR
    void changedRegion(int* x, int* y, int* w, int* h) const;

private:
    int m_gridW, m_gridH;
    std::vector<uint8_t> m_prev;   // ערכי בהירות ממוצעים לכל תא
    std::vector<uint8_t> m_cur;
    double m_lastRatio = 0.0;
    int m_cx = 0, m_cy = 0, m_cw = 0, m_ch = 0; // אזור שינוי (פיקסלים)
    bool m_havePrev = false;
};

} // namespace aj
