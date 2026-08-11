// =============================================================================
//  Adiel Junior — StubScreenSource
//  מקור מסך מדומה לבדיקות ופיתוח (Linux / מצב headless):
//  מייצר פריימים סינתטיים עם אזור "טקסט" משתנה לבדיקת FrameDiffer + OCR-משולב.
// =============================================================================
#pragma once

#include <atomic>

#include "vision/IScreenSource.h"

namespace aj {

class StubScreenSource final : public IScreenSource {
public:
    StubScreenSource() = default;

    bool start() override { m_running = true; return true; }
    void stop() override { m_running = false; }
    std::shared_ptr<Frame> capture(int timeoutMs) override;
    int width() const override { return 1920; }
    int height() const override { return 1080; }
    std::string name() const override { return "StubScreenSource (מדומה)"; }

private:
    std::atomic<bool> m_running{false};
    uint64_t m_frameNo = 0;
};

} // namespace aj
