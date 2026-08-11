// =============================================================================
//  Adiel Junior — HudNull
//  HUD ראשי-ללא-ממשק: ללוגים בלבד (מצב headless / Linux / בדיקות).
// =============================================================================
#pragma once

#include <atomic>

#include "hud/IHud.h"
#include "hud/HudModel.h"

namespace aj {

class HudNull final : public IHud {
public:
    bool init(const Config& cfg, ActionCallback onAction) override;
    void run() override;
    void requestExit() override { m_exit = true; }

    void setMode(const std::string& m) override { m_model.setMode(m); }
    void setStatus(const std::string& s) override { m_model.setStatus(s); }
    void setUserText(const std::string& t) override { m_model.setUserText(t); }
    void setTokens(const std::string& t) override { m_model.setTokens(t); }
    void clearTokens() override { m_model.clearTokens(); }
    void setEngineName(const std::string& n) override { m_model.setEngineName(n); }
    void setEnergy(float e) override { m_model.setEnergy(e); }
    void setBins(const std::vector<float>& bins) override { m_model.setBins(bins); }
    void setState(const std::string& s) override { m_model.setState(s); }
    std::string mode() const override { return m_model.getMode(); }

private:
    HudModel m_model;
    std::atomic<bool> m_exit{false};
};

} // namespace aj
