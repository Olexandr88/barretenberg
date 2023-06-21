#pragma once
#include "barretenberg/stdlib/primitives/byte_array/byte_array.hpp"
#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders_fwd.hpp"

namespace proof_system::plonk {
namespace stdlib {

template <typename Composer> byte_array<Composer> blake3s(const byte_array<Composer>& input);
#define BLAKE3S(COMPOSER_TYPE) byte_array<COMPOSER_TYPE> blake3s(const byte_array<COMPOSER_TYPE>& input);

EXTERN_STDLIB_METHOD(BLAKE3S)

} // namespace stdlib
} // namespace proof_system::plonk
