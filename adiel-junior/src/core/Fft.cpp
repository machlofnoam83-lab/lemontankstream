#include "core/Fft.h"

#include <cmath>

namespace aj {

Fft::Fft(size_t n) : m_n(n) {
    m_cosTable.resize(n / 2);
    m_sinTable.resize(n / 2);
    for (size_t i = 0; i < n / 2; ++i) {
        double a = 2.0 * M_PI * static_cast<double>(i) / static_cast<double>(n);
        m_cosTable[i] = std::cos(a);
        m_sinTable[i] = std::sin(a);
    }
    m_win.resize(n);
    for (size_t i = 0; i < n; ++i) {
        m_win[i] = 0.5 * (1.0 - std::cos(2.0 * M_PI * static_cast<double>(i) / static_cast<double>(n - 1)));
    }
    m_re.assign(n, 0.0);
    m_im.assign(n, 0.0);
    m_mag.assign(n / 2, 0.0f);
}

void Fft::compute(const float* samples, size_t n) {
    const size_t N = m_n;
    if (n > N) n = N;

    for (size_t i = 0; i < n; ++i) {
        m_re[i] = static_cast<double>(samples[i]) * m_win[i];
        m_im[i] = 0.0;
    }
    for (size_t i = n; i < N; ++i) { m_re[i] = 0.0; m_im[i] = 0.0; }

    // Bit-reversal permutation
    for (size_t i = 1, j = 0; i < N; ++i) {
        size_t bit = N >> 1;
        for (; j & bit; bit >>= 1) j ^= bit;
        j ^= bit;
        if (i < j) { std::swap(m_re[i], m_re[j]); std::swap(m_im[i], m_im[j]); }
    }

    // Cooley–Tukey, in-place
    for (size_t len = 2; len <= N; len <<= 1) {
        size_t half = len >> 1;
        size_t step = N / len;
        for (size_t i = 0; i < N; i += len) {
            for (size_t k = 0; k < half; ++k) {
                double c = m_cosTable[k * step];
                double s = m_sinTable[k * step];
                double re = m_re[i + k + half] * c + m_im[i + k + half] * s;
                double im = m_im[i + k + half] * c - m_re[i + k + half] * s;
                m_re[i + k + half] = m_re[i + k] - re;
                m_im[i + k + half] = m_im[i + k] - im;
                m_re[i + k] += re;
                m_im[i + k] += im;
            }
        }
    }

    // משרעות מנורמלות [0..1] (לוגריתמי רך)
    double e = 0.0;
    for (size_t i = 0; i < N / 2; ++i) {
        double mag = std::sqrt(m_re[i] * m_re[i] + m_im[i] * m_im[i]);
        mag /= static_cast<double>(N) * 0.5;
        // דחיסה לוגריתמית — "רך" לעין
        double db = 20.0 * std::log10(mag + 1e-6);
        float v = static_cast<float>((db + 60.0) / 60.0);
        if (v < 0.0f) v = 0.0f;
        if (v > 1.0f) v = 1.0f;
        m_mag[i] = v;
        e += static_cast<double>(v);
    }
    m_energy = static_cast<float>(e / static_cast<double>(N / 2));
}

} // namespace aj
