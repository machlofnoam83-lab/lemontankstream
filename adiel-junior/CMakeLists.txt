# =============================================================================
#  Adiel Junior — מנוע עוזר אישי חכם, Native C++20, Windows x64
#  "אדיאל ג'וניור" — JARVIS-style local assistant (100% offline)
#
#  Build:  cmake -B build -G "Visual Studio 17 2022" -A x64
#          cmake --build build --config Release
#  Or use the one-click pipeline:  scripts\build.ps1
# =============================================================================
cmake_minimum_required(VERSION 3.20)

project(AdielJunior
    VERSION 1.0.0
    DESCRIPTION "Adiel Junior - Native C++20 local AI assistant (Hebrew, offline, JARVIS-style HUD)"
    LANGUAGES CXX C)

# ---------------------------------------------------------------------------
#  Options
# ---------------------------------------------------------------------------
option(ADIEL_USE_LLAMA     "Link llama.cpp (native 3B GGUF engine, static)"          ON)
option(ADIEL_USE_WHISPER   "Link whisper.cpp (local Hebrew STT)"                     ON)
option(ADIEL_USE_PORCUPINE "Use Porcupine wake word (dynamic load of libpv_porcupine)" ON)
option(ADIEL_USE_OCR       "Windows.Media.Ocr screen reading (WinRT)"                 ON)
option(ADIEL_USE_SHERTA_TTS "Sherpa-ONNX offline TTS (Hebrew VITS voice)"            OFF)
option(ADIEL_USE_PIPER     "Piper TTS (requires onnxruntime + espeak-ng)"            OFF)
option(ADIEL_HUD_D3D12     "HUD renderer: Direct3D 12 (via 11on12) with D3D11 fallback" ON)
option(ADIEL_STATIC_RT     "MSVC: static CRT (/MT) for a single self-contained exe"  ON)
option(ADIEL_BUILD_SELFTEST "Build the --selftest diagnostics into the exe"          ON)

# External SDK root dirs (optional; when unset, CMake fetches pinned sources)
set(ADIEL_LLAMA_DIR       "" CACHE PATH "Path to a local llama.cpp checkout (optional)")
set(ADIEL_WHISPER_DIR     "" CACHE PATH "Path to a local whisper.cpp checkout (optional)")
set(ADIEL_PORCUPINE_DIR   "" CACHE PATH "Path to a local Porcupine checkout (optional)")
set(ADIEL_SHERTA_ONNX_DIR "" CACHE PATH "Path to a built sherpa-onnx package (optional)")
set(ADIEL_PIPER_DIR       "" CACHE PATH "Path to a local piper checkout (optional)")

# llama.cpp GPU backend passthrough (set e.g. -DGGML_CUDA=ON or -DGGML_DML=ON)
set(GGML_CUDA OFF CACHE BOOL "llama.cpp: CUDA backend")
set(GGML_DML  OFF CACHE BOOL "llama.cpp: DirectML backend (Windows GPU)")

# ---------------------------------------------------------------------------
#  Global settings
# ---------------------------------------------------------------------------
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

if(NOT CMAKE_BUILD_TYPE)
    set(CMAKE_BUILD_TYPE Release)
endif()

if(MSVC)
    add_compile_options(/W4 /permissive- /utf-8 /EHsc /Zc:__cplusplus)
    add_compile_definitions(_CRT_SECURE_NO_WARNINGS NOMINMAX WIN32_LEAN_AND_MEAN)
    if(ADIEL_STATIC_RT)
        foreach(flag CMAKE_CXX_FLAGS CMAKE_CXX_FLAGS_RELEASE CMAKE_CXX_FLAGS_DEBUG)
            string(REPLACE "/MD" "/MT" ${flag} "${${flag}}")
        endforeach()
        foreach(flag CMAKE_C_FLAGS CMAKE_C_FLAGS_RELEASE CMAKE_C_FLAGS_DEBUG)
            string(REPLACE "/MD" "/MT" ${flag} "${${flag}}")
        endforeach()
    endif()
else()
    add_compile_options(-Wall -Wextra)
endif()

# ---------------------------------------------------------------------------
#  Sources
# ---------------------------------------------------------------------------
set(AJ_CORE_SOURCES
    src/core/Logger.cpp
    src/core/Config.cpp
    src/core/Fft.cpp
    src/core/Json.cpp
)
set(AJ_AI_SOURCES
    src/ai/PromptBuilder.cpp
    src/ai/StubLlm.cpp
    src/ai/LlmFactory.cpp
)
set(AJ_VISION_SOURCES
    src/vision/FrameDiffer.cpp
    src/vision/ScreenContext.cpp
    src/vision/StubScreenSource.cpp
)
set(AJ_AUDIO_SOURCES
    src/audio/WakeWordStub.cpp
    src/audio/WakeWordFactory.cpp
    src/audio/SttStub.cpp
    src/audio/SttFactory.cpp
    src/audio/TtsStub.cpp
    src/audio/TtsBase.cpp
    src/audio/TtsFactory.cpp
)
set(AJ_HUD_SOURCES
    src/hud/HudNull.cpp
)
set(AJ_APP_SOURCES
    src/app/CommandRouter.cpp
    src/app/AdielApp.cpp
    src/main.cpp
)

if(ADIEL_BUILD_SELFTEST)
    list(APPEND AJ_APP_SOURCES src/selftest.cpp)
endif()

if(WIN32)
    list(APPEND AJ_APP_SOURCES src/version.rc)
    list(APPEND AJ_VISION_SOURCES src/vision/DxgiScreenSource.cpp)
    list(APPEND AJ_AUDIO_SOURCES
        src/audio/WasapiMicCapture.cpp
        src/audio/WasapiAudioOut.cpp
        src/audio/PorcupineWakeWord.cpp
        src/audio/WhisperStt.cpp
    )
    list(APPEND AJ_HUD_SOURCES src/hud/D2dHud.cpp)
    if(ADIEL_USE_SHERTA_TTS)
        list(APPEND AJ_AUDIO_SOURCES src/audio/SherpaTts.cpp)
    endif()
    if(ADIEL_USE_PIPER)
        list(APPEND AJ_AUDIO_SOURCES src/audio/PiperTts.cpp)
    endif()
    if(ADIEL_USE_LLAMA)
        list(APPEND AJ_AI_SOURCES src/ai/LlamaCppEngine.cpp)
    endif()
endif()

add_executable(AdielJunior WIN32 ${AJ_CORE_SOURCES} ${AJ_AI_SOURCES} ${AJ_VISION_SOURCES}
                               ${AJ_AUDIO_SOURCES} ${AJ_HUD_SOURCES} ${AJ_APP_SOURCES})

target_include_directories(AdielJunior PRIVATE src)

if(ADIEL_HUD_D3D12)
    target_compile_definitions(AdielJunior PRIVATE ADIEL_HUD_D3D12=1)
endif()

# ---------------------------------------------------------------------------
#  llama.cpp — מנוע ה-AI המקומי (static link, Q4_K_M/Q8_0 GGUF, 3B)
# ---------------------------------------------------------------------------
if(ADIEL_USE_LLAMA AND WIN32)
    set(LLAMA_BUILD_TESTS OFF CACHE BOOL "" FORCE)
    set(LLAMA_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
    set(LLAMA_BUILD_TOOLS OFF CACHE BOOL "" FORCE)
    set(LLAMA_BUILD_SERVER OFF CACHE BOOL "" FORCE)
    set(BUILD_SHARED_LIBS OFF CACHE BOOL "" FORCE)
    set(LLAMA_CURL OFF CACHE BOOL "" FORCE)
    set(LLAMA_GGML_SYCL OFF CACHE BOOL "" FORCE)

    if(ADIEL_LLAMA_DIR)
        add_subdirectory(${ADIEL_LLAMA_DIR} ${CMAKE_BINARY_DIR}/_deps/llama.cpp)
    else()
        # ננעל ל-commit ספציפי — API יציב ומתועד (גרסה מ-2026)
        include(FetchContent)
        FetchContent_Declare(llama_cpp
            GIT_REPOSITORY https://github.com/ggml-org/llama.cpp.git
            GIT_TAG        030ebb558a5820b444a8f836ed5cdd46c9b4bd7a
            GIT_SHALLOW    TRUE
        )
        FetchContent_MakeAvailable(llama_cpp)
    endif()
    target_link_libraries(AdielJunior PRIVATE llama)
    target_compile_definitions(AdielJunior PRIVATE ADIEL_HAVE_LLAMA=1)
endif()

# ---------------------------------------------------------------------------
#  whisper.cpp — זיהוי דיבור מקומי (STT)
# ---------------------------------------------------------------------------
if(ADIEL_USE_WHISPER AND WIN32)
    set(WHISPER_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
    set(WHISPER_BUILD_TESTS OFF CACHE BOOL "" FORCE)
    set(WHISPER_BUILD_SERVER OFF CACHE BOOL "" FORCE)
    set(BUILD_SHARED_LIBS OFF CACHE BOOL "" FORCE)

    if(ADIEL_WHISPER_DIR)
        add_subdirectory(${ADIEL_WHISPER_DIR} ${CMAKE_BINARY_DIR}/_deps/whisper.cpp)
    else()
        include(FetchContent)
        FetchContent_Declare(whisper_cpp
            GIT_REPOSITORY https://github.com/ggml-org/whisper.cpp.git
            GIT_TAG        592feef04a1802b18cbeffd0fd0eb5d02570c2ec
            GIT_SHALLOW    TRUE
        )
        FetchContent_MakeAvailable(whisper_cpp)
    endif()
    target_link_libraries(AdielJunior PRIVATE whisper)
    target_compile_definitions(AdielJunior PRIVATE ADIEL_HAVE_WHISPER=1)
endif()

# ---------------------------------------------------------------------------
#  Windows system libs
# ---------------------------------------------------------------------------
if(WIN32)
    target_link_libraries(AdielJunior PRIVATE
        d3d11 d3d12 d2d1 dwrite dcomp dxgi dxguid
        ole32 oleaut32 uuid user32 gdi32 shell32 advapi32 ws2_32
        windowscodecs runtimeobject
    )
endif()

# ---------------------------------------------------------------------------
#  Porcupine — מילת הפעלה (טעינה דינמית, אין צורך ב-import lib)
# ---------------------------------------------------------------------------
if(ADIEL_USE_PORCUPINE AND WIN32)
    target_compile_definitions(AdielJunior PRIVATE ADIEL_HAVE_PORCUPINE=1)
    if(ADIEL_PORCUPINE_DIR)
        # כותרות Porcupine (pv_porcupine.h) + נתיב DLL לטעינה דינמית
        target_include_directories(AdielJunior PRIVATE ${ADIEL_PORCUPINE_DIR}/include)
        target_compile_definitions(AdielJunior PRIVATE
            ADIEL_PORCUPINE_DLL="${ADIEL_PORCUPINE_DIR}/lib/windows/amd64/libpv_porcupine.dll")
    endif()
endif()

# ---------------------------------------------------------------------------
#  OCR (Windows.Media.Ocr) — קריאת מסך בעברית, WinRT
# ---------------------------------------------------------------------------
if(ADIEL_USE_OCR AND WIN32)
    target_compile_definitions(AdielJunior PRIVATE ADIEL_HAVE_OCR=1)
endif()

# ---------------------------------------------------------------------------
#  Sherpa-ONNX TTS — קול עברי מקומי (אופציונלי)
# ---------------------------------------------------------------------------
if(ADIEL_USE_SHERTA_TTS AND WIN32 AND ADIEL_SHERTA_ONNX_DIR)
    target_include_directories(AdielJunior PRIVATE ${ADIEL_SHERTA_ONNX_DIR}/include)
    target_link_directories(AdielJunior PRIVATE ${ADIEL_SHERTA_ONNX_DIR}/lib)
    target_link_libraries(AdielJunior PRIVATE sherpa-onnx-c-api)
    target_compile_definitions(AdielJunior PRIVATE ADIEL_HAVE_SHERTA_TTS=1)
endif()

# ---------------------------------------------------------------------------
#  Piper TTS (אופציונלי — דורש onnxruntime + espeak-ng)
# ---------------------------------------------------------------------------
if(ADIEL_USE_PIPER AND WIN32 AND ADIEL_PIPER_DIR)
    set(PIPER_BUILD_TESTING OFF CACHE BOOL "" FORCE)
    add_subdirectory(${ADIEL_PIPER_DIR} ${CMAKE_BINARY_DIR}/_deps/piper)
    target_link_libraries(AdielJunior PRIVATE piper)
    target_compile_definitions(AdielJunior PRIVATE ADIEL_HAVE_PIPER=1)
endif()

# ---------------------------------------------------------------------------
#  Tool: מחולל הלוגו ההולוגרפי (C++ טהור, ללא תלות חיצונית)
# ---------------------------------------------------------------------------
add_executable(gen_icon tools/gen_icon/gen_icon.cpp)
target_compile_definitions(gen_icon PRIVATE NOMINMAX WIN32_LEAN_AND_MEAN)

# ---------------------------------------------------------------------------
#  פלט: AdielJunior.exe יחיד ועצמאי
# ---------------------------------------------------------------------------
set_target_properties(AdielJunior PROPERTIES
    OUTPUT_NAME "AdielJunior"
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/bin"
)
set_target_properties(gen_icon PROPERTIES
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/bin"
)

# ---------------------------------------------------------------------------
#  Tool: build_corpus - בניית קורפוס האימון שלנו (C++ טהור)
# ---------------------------------------------------------------------------
add_executable(build_corpus tools/build_corpus.cpp)
set_target_properties(build_corpus PROPERTIES
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/bin"
)

if(MSVC)
    # דוח-זהירות: לא לעצור בנייה על אזהרות של SDK חיצוני
    target_compile_options(AdielJunior PRIVATE /WX-)
endif()
