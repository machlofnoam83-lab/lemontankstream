// =============================================================================
//  Adiel Junior — DxgiScreenSource
//  תפיסת מסך חיה בזמן אמת: DXGI Desktop Duplication API (30-60 FPS, Zero-Copy).
//  כולל נפילה אוטומטית ל-GDI BitBlt כאשר Duplication לא זמין (RDP וכדומה).
// =============================================================================
#pragma once

#ifdef _WIN32
#include <d3d11.h>
#include <dxgi1_2.h>
#include <wrl/client.h>

#include <atomic>
#include <mutex>
#include <thread>

#include "core/Config.h"
#include "vision/IScreenSource.h"

namespace aj {

class DxgiScreenSource final : public IScreenSource {
public:
    explicit DxgiScreenSource(const Config& cfg);
    ~DxgiScreenSource() override;

    bool start() override;
    void stop() override;
    std::shared_ptr<Frame> capture(int timeoutMs) override;
    int width() const override { return m_width; }
    int height() const override { return m_height; }
    std::string name() const override { return m_usingGdi ? "GDI BitBlt (fallback)" : "DXGI Desktop Duplication"; }

private:
    bool initDxgi();
    bool initGdi();
    void shutdown();

    std::shared_ptr<Frame> captureDxgi(int timeoutMs);
    std::shared_ptr<Frame> captureGdi();

    const Config& m_cfg;
    std::atomic<bool> m_running{false};

    // DXGI
    Microsoft::WRL::ComPtr<ID3D11Device>           m_d3d11;
    Microsoft::WRL::ComPtr<ID3D11DeviceContext>    m_d3dCtx;
    Microsoft::WRL::ComPtr<IDXGIOutputDuplication> m_dup;
    Microsoft::WRL::ComPtr<ID3D11Texture2D>        m_staging;
    Microsoft::WRL::ComPtr<IDXGIOutput>            m_output;

    // GDI fallback
    bool m_usingGdi = false;

    int m_width = 0, m_height = 0;
    DXGI_FORMAT m_fmt = DXGI_FORMAT_UNKNOWN;
    mutable std::mutex m_mtx;
};

} // namespace aj
#endif // _WIN32
