# if(EMSCRIPTEN)
#   set(TOOLCHAIN "wasm-emscripten" CACHE STRING "Build toolchain." FORCE)
#   message(STATUS "Toolchain: ${TOOLCHAIN}")
#   include("./cmake/toolchains/${TOOLCHAIN}.cmake")
# else
if(CMAKE_TOOLCHAIN_FILE)
  message(STATUS "Toolchain: provided via CMAKE_TOOLCHAIN_FILE")
elseif(CMAKE_C_COMPILER AND CMAKE_CXX_COMPILER)
  message(STATUS "Toolchain: manually chosen ${CMAKE_C_COMPILER} and ${CMAKE_CXX_COMPILER}")
else()
  if(NOT TOOLCHAIN)
    set(TOOLCHAIN "x86_64-linux-clang" CACHE STRING "Build toolchain." FORCE)
  endif()
  message(STATUS "Toolchain: ${TOOLCHAIN}")

  include("./cmake/toolchains/${TOOLCHAIN}.cmake")
endif()