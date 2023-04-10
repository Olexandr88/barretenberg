#include "c_bind.hpp"
#include "schnorr.hpp"
#include "multisig.hpp"

extern "C" {

using namespace barretenberg;
using affine_element = grumpkin::g1::affine_element;
using multisig = crypto::schnorr::multisig<grumpkin::g1, KeccakHasher, Blake2sHasher>;
using multisig_public_key = typename multisig::MultiSigPublicKey;

WASM_EXPORT void schnorr__compute_public_key(uint8_t const* private_key, uint8_t* public_key_buf)
{
    auto priv_key = from_buffer<grumpkin::fr>(private_key);
    grumpkin::g1::affine_element pub_key = grumpkin::g1::one * priv_key;
    write(public_key_buf, pub_key);
}

WASM_EXPORT void schnorr__negate_public_key(uint8_t const* public_key_buffer, uint8_t* output)
{
    // Negate the public key (effectively negating the y-coordinate of the public key) and return the resulting public
    // key.
    auto account_public_key = from_buffer<grumpkin::g1::affine_element>(public_key_buffer);
    barretenberg::group_elements::write(output, -account_public_key);
}

#pragma GCC diagnostic push
#pragma GCC diagnostic ignored "-Wunused-parameter"
#pragma GCC diagnostic ignored "-Wunused-variable"
WASM_EXPORT void schnorr__construct_signature(uint8_t const* message_buf,
                                              uint8_t const* private_key,
                                              uint8_t* s,
                                              uint8_t* e)
{
    auto message = from_buffer<std::string>(message_buf);
    auto priv_key = from_buffer<grumpkin::fr>(private_key);
    grumpkin::g1::affine_element pub_key = grumpkin::g1::one * priv_key;
    crypto::schnorr::key_pair<grumpkin::fr, grumpkin::g1> key_pair = { priv_key, pub_key };
    auto sig = crypto::schnorr::construct_signature<Blake2sHasher, grumpkin::fq>(message, key_pair);
    write(s, sig.s);
    write(e, sig.e);
}

WASM_EXPORT void schnorr__verify_signature(
    uint8_t const* message_buf, uint8_t const* pub_key, uint8_t const* sig_s, uint8_t const* sig_e, bool* result)
{
    auto pubk = from_buffer<grumpkin::g1::affine_element>(pub_key);
    auto message = from_buffer<std::string>(message_buf);
    std::array<uint8_t, 32> s;
    std::array<uint8_t, 32> e;
    std::copy(sig_s, sig_s + 32, s.begin());
    std::copy(sig_e, sig_e + 32, e.begin());
    crypto::schnorr::signature sig = { s, e };
    *result =
        crypto::schnorr::verify_signature<Blake2sHasher, grumpkin::fq, grumpkin::fr, grumpkin::g1>(message, pubk, sig);
}

WASM_EXPORT void schnorr__multisig_create_multisig_public_key(uint8_t const* private_key, uint8_t* multisig_pubkey_buf)
{
    using multisig = crypto::schnorr::multisig<grumpkin::g1, KeccakHasher, Blake2sHasher>;
    using multisig_public_key = typename multisig::MultiSigPublicKey;
    auto priv_key = from_buffer<grumpkin::fr>(private_key);
    grumpkin::g1::affine_element pub_key = grumpkin::g1::one * priv_key;
    crypto::schnorr::key_pair<grumpkin::fr, grumpkin::g1> key_pair = { priv_key, pub_key };

    auto agg_pubkey = multisig_public_key(key_pair);

    write(multisig_pubkey_buf, agg_pubkey);
}

WASM_EXPORT void schnorr__multisig_validate_and_combine_signer_pubkeys(uint8_t const* signer_pubkey_buf,
                                                                       affine_element::out_buf combined_key_buf,
                                                                       bool* success)
{
    using multisig = crypto::schnorr::multisig<grumpkin::g1, KeccakHasher, Blake2sHasher>;
    auto pubkeys = from_buffer<std::vector<multisig::MultiSigPublicKey>>(signer_pubkey_buf);

    auto combined_key = multisig::validate_and_combine_signer_pubkeys(pubkeys);

    if (combined_key) {
        write(combined_key_buf, *combined_key);
        *success = true;
    } else {
        write(combined_key_buf, affine_element::one());
        *success = false;
    }
}

WASM_EXPORT void schnorr__multisig_construct_signature_round_1(uint8_t* round_one_public_output_buf,
                                                               uint8_t* round_one_private_output_buf)
{
    using multisig = crypto::schnorr::multisig<grumpkin::g1, KeccakHasher, Blake2sHasher>;

    auto [public_output, private_output] = multisig::construct_signature_round_1();
    write(round_one_public_output_buf, public_output);
    write(round_one_private_output_buf, private_output);
}

WASM_EXPORT void schnorr__multisig_construct_signature_round_2(uint8_t const* message_buf,
                                                               uint8_t const* private_key,
                                                               uint8_t const* signer_round_one_private_buf,
                                                               uint8_t const* signer_pubkeys_buf,
                                                               uint8_t const* round_one_public_buf,
                                                               uint8_t* round_two_buf,
                                                               bool* success)
{
    using multisig = crypto::schnorr::multisig<grumpkin::g1, KeccakHasher, Blake2sHasher>;
    auto message = from_buffer<std::string>(message_buf);
    auto priv_key = from_buffer<grumpkin::fr>(private_key);
    grumpkin::g1::affine_element pub_key = grumpkin::g1::one * priv_key;
    crypto::schnorr::key_pair<grumpkin::fr, grumpkin::g1> key_pair = { priv_key, pub_key };

    auto signer_pubkeys = from_buffer<std::vector<multisig::MultiSigPublicKey>>(signer_pubkeys_buf);
    auto round_one_outputs = from_buffer<std::vector<multisig::RoundOnePublicOutput>>(round_one_public_buf);

    auto round_one_private = from_buffer<multisig::RoundOnePrivateOutput>(signer_round_one_private_buf);
    auto round_two_output =
        multisig::construct_signature_round_2(message, key_pair, round_one_private, signer_pubkeys, round_one_outputs);

    if (round_two_output.has_value()) {
        write(round_two_buf, *round_two_output);
        *success = true;
    } else {
        *success = false;
    }
}

WASM_EXPORT void schnorr__multisig_combine_signatures(uint8_t const* message_buf,
                                                      uint8_t const* signer_pubkeys_buf,
                                                      uint8_t const* round_one_buf,
                                                      uint8_t const* round_two_buf,
                                                      uint8_t* s,
                                                      uint8_t* e,
                                                      bool* success)
{
    using multisig = crypto::schnorr::multisig<grumpkin::g1, KeccakHasher, Blake2sHasher>;

    auto message = from_buffer<std::string>(message_buf);
    auto signer_pubkeys = from_buffer<std::vector<multisig::MultiSigPublicKey>>(signer_pubkeys_buf);
    auto round_one_outputs = from_buffer<std::vector<multisig::RoundOnePublicOutput>>(round_one_buf);
    auto round_two_outputs = from_buffer<std::vector<multisig::RoundTwoPublicOutput>>(round_two_buf);

    auto sig = multisig::combine_signatures(message, signer_pubkeys, round_one_outputs, round_two_outputs);

    if (sig.has_value()) {
        write(s, (*sig).s);
        write(e, (*sig).e);
        *success = true;
    } else {
        *success = false;
    }
}
}
