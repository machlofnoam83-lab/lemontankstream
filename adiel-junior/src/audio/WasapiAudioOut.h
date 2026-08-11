// =============================================================================
//  Adiel Junior — WasapiAudioOut
//  השמעת דגימות float דרך מכשיר הפלט ברירת המחדל (WASAPI render).
// =============================================================================
#pragma once

#ifdef _WIN32
#include <windows.h>
#include <mmdeviceapi.h>
#include <audioclient.h>
#include <wrl/client.h>

#include <atomic>
#include <cstdint>
#include <vector>

namespace aj {

class WasapiAudioOut {
public:
    WasapiAudioOut() = default;
    ~WasapiAudioOut() { close(); }

    bool open(int sampleRate, int channels = 1);
    void close();

    // משמיע עד הסוף (או עד interrupt). חוסם.
    void play(const std::vector<float>& samples, std::atomic<bool>& interrupt);

private:
    Microsoft::WRL::ComPtr<IMMDevice>       m_device;
    Microsoft::WRL::ComPtr<IAudioClient>    m_client;
    Microsoft::WRL::ComPtr<IAudioRenderClient> m_render;
    HANDLE m_event = nullptr;
    UINT32 m_bufferFrames = 0;
    UINT32 m_channels = 1;
    UINT32 m_sampleRate = 48000;
};

} // namespace aj
#endif // _WIN32
