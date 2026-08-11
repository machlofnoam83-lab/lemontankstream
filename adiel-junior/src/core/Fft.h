// =============================================================================
//  Adiel Junior — Fft
//  התמרת פורייה מהירה (radix-2) + חלון Hann — עבור ויזואליזציית הקול ב-HUD.
// =============================================================================
#pragma once

#include <cstddef>
#include <vector>

namespace aj {

class Fft {
public:
    // n חייב להיות חזקה של 2
    explicit Fft(size_t n);

    // מחשב ספקטרום משרעת (dB-normalized) מתוך דגימות ריאליות.
    // הפלט: m_bins/2+1 bin לוגריתמיים-ish (לינארי בפשטות).
    void compute(const float* samples, size_t n);

    // מספר bin-ים שמישים (חצי מהגודל)
    size_t bins() const { return m_n / 2; }

    // ערך bin מנורמל [0..1]
    float bin(size_t i) const { return i < m_mag.size() ? m_mag[i] : 0.0f; }

    // ממוצע אנרגיה כללי [0..1] — לפעימות הטבעת
    float energy() const { return m_energy; }

private:
    size_t m_n;
    std::vector<double> m_cosTable;
    std::vector<double> m_sinTable;
    std::vector<double> m_win;   // חלון Hann
    std::vector<double> m_re, m_im;
    std::vector<float> m_mag;
    float m_energy = 0.0f;
};

} // namespace aj
