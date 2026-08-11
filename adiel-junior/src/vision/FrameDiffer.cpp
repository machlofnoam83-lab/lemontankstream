#include "vision/FrameDiffer.h"

#include <algorithm>
#include <cstring>

namespace aj {

FrameDiffer::FrameDiffer(int gridW, int gridH)
    : m_gridW(gridW), m_gridH(gridH) {
    m_prev.assign(static_cast<size_t>(gridW) * gridH, 0);
    m_cur.assign(static_cast<size_t>(gridW) * gridH, 0);
}

double FrameDiffer::diff(const std::shared_ptr<Frame>& frame) {
    if (!frame || frame->empty || frame->width <= 0 || frame->height <= 0) {
        m_havePrev = false;
        m_lastRatio = 0.0;
        return 0.0;
    }

    const int W = frame->width, H = frame->height;
    const int gw = m_gridW, gh = m_gridH;

    // ממוצע בהירות לכל תא ברשת
    for (int gy = 0; gy < gh; ++gy) {
        int y0 = (gy * H) / gh;
        int y1 = std::max(y0 + 1, ((gy + 1) * H) / gh);
        for (int gx = 0; gx < gw; ++gx) {
            int x0 = (gx * W) / gw;
            int x1 = std::max(x0 + 1, ((gx + 1) * W) / gw);
            uint64_t sum = 0;
            uint64_t count = 0;
            for (int y = y0; y < y1; ++y) {
                const uint8_t* p = frame->row(y);
                for (int x = x0; x < x1; ++x) {
                    const uint8_t* px = p + static_cast<size_t>(x) * 4;
                    sum += (static_cast<uint32_t>(px[0]) * 11 +
                            static_cast<uint32_t>(px[1]) * 59 +
                            static_cast<uint32_t>(px[2]) * 30) >> 7; // לומה משוקללת
                    ++count;
                }
            }
            m_cur[static_cast<size_t>(gy) * gw + gx] =
                static_cast<uint8_t>(count ? sum / count : 0);
        }
    }

    if (!m_havePrev) {
        m_prev.swap(m_cur);
        m_havePrev = true;
        m_lastRatio = 0.0;
        return 0.0;
    }

    // אחוז התאים ששונו משמעותית (> 12/255)
    const int thr = 12;
    int changed = 0;
    int minX = gw, minY = gh, maxX = -1, maxY = -1;
    for (int gy = 0; gy < gh; ++gy) {
        for (int gx = 0; gx < gw; ++gx) {
            size_t idx = static_cast<size_t>(gy) * gw + gx;
            int d = std::abs(static_cast<int>(m_cur[idx]) - static_cast<int>(m_prev[idx]));
            if (d > thr) {
                ++changed;
                minX = std::min(minX, gx); maxX = std::max(maxX, gx);
                minY = std::min(minY, gy); maxY = std::max(maxY, gy);
            }
        }
    }

    m_prev.swap(m_cur);
    m_lastRatio = static_cast<double>(changed) / static_cast<double>(gw * gh);

    // אזור השינוי בפיקסלי מקור
    if (changed > 0) {
        m_cx = (minX * W) / gw;
        m_cy = (minY * H) / gh;
        m_cw = std::max(1, ((maxX + 1) * W) / gw - m_cx);
        m_ch = std::max(1, ((maxY + 1) * H) / gh - m_cy);
    } else {
        m_cx = m_cy = m_cw = m_ch = 0;
    }
    return m_lastRatio;
}

void FrameDiffer::changedRegion(int* x, int* y, int* w, int* h) const {
    if (x) *x = m_cx;
    if (y) *y = m_cy;
    if (w) *w = m_cw;
    if (h) *h = m_ch;
}

} // namespace aj
