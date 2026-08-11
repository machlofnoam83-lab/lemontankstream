# =============================================================================
#  gen_icon — מחולל לוגו הולוגרפי (C++ טהור, ללא תלות חיצונית)
#  פרויקט CMake עצמאי — לא מושך את llama.cpp/whisper.cpp (בנייה מהירה).
#  שימוש: cmake -S tools\gen_icon -B build\icon -A x64
#         cmake --build build\icon --config Release
# =============================================================================
cmake_minimum_required(VERSION 3.20)
project(gen_icon LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

add_executable(gen_icon gen_icon.cpp)
