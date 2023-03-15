#pragma once
#include "barretenberg/polynomials/polynomial.hpp"
#include "barretenberg/honk/sumcheck/sumcheck.hpp"
#include "barretenberg/honk/sumcheck/relations/relation.hpp"
#include "barretenberg/honk/pcs/commitment_key.hpp"
#include "barretenberg/honk/pcs/gemini/gemini.hpp"
#include "barretenberg/honk/pcs/shplonk/shplonk_single.hpp"
#include "barretenberg/honk/pcs/shplonk/shplonk.hpp"
#include "barretenberg/honk/pcs/kzg/kzg.hpp"
#include "barretenberg/transcript/transcript_wrappers.hpp"
#include "barretenberg/plonk/proof_system/types/proof.hpp"
#include "barretenberg/proof_system/proving_key/proving_key.hpp"
#include "barretenberg/proof_system/flavor/flavor.hpp"
#include "barretenberg/plonk/proof_system/types/prover_settings.hpp"

#include <array>
#include <span>
#include <vector>
#include <memory>

namespace honk {

template <typename settings> class Prover {

    using Fr = barretenberg::fr;
    using Polynomial = barretenberg::Polynomial<Fr>;
    using POLYNOMIAL = bonk::StandardArithmetization::POLYNOMIAL;

  public:
    Prover(std::vector<Polynomial>&& wire_polys,
           std::shared_ptr<bonk::proving_key> input_key = nullptr,
           const transcript::Manifest& manifest = transcript::Manifest());

    void execute_preamble_round();
    void execute_wire_commitments_round();
    void execute_tables_round();
    void execute_grand_product_computation_round();
    void execute_relation_check_rounds();
    void execute_univariatization_round();
    void execute_pcs_evaluation_round();
    void execute_shplonk_round();
    void execute_kzg_round();

    void compute_wire_commitments();

    Polynomial compute_grand_product_polynomial(Fr beta, Fr gamma);

    void construct_prover_polynomials();

    plonk::proof& export_proof();
    plonk::proof& construct_proof();

    transcript::StandardTranscript transcript;

    std::vector<Fr> public_inputs;

    std::vector<Polynomial> wire_polynomials;
    Polynomial z_permutation;

    sumcheck::RelationParameters<Fr> relation_parameters;

    std::shared_ptr<bonk::proving_key> key;

    std::shared_ptr<pcs::kzg::CommitmentKey> commitment_key;

    // Container for spans of all polynomials required by the prover (i.e. all multivariates evaluated by Sumcheck).
    std::array<std::span<Fr>, bonk::StandardArithmetization::POLYNOMIAL::COUNT> prover_polynomials;

    // Honk only needs a small portion of the functionality but may be fine to use existing work_queue
    // NOTE: this is not currently in use, but it may well be used in the future.
    // TODO(Adrian): Uncomment when we need this again.
    // bonk::work_queue queue;
    // void flush_queued_work_items() { queue.flush_queue(); }
    // bonk::work_queue::work_item_info get_queued_work_item_info() const {
    //     return queue.get_queued_work_item_info();
    // }
    // size_t get_scalar_multiplication_size(const size_t work_item_number) const
    // {
    //     return queue.get_scalar_multiplication_size(work_item_number);
    // }

    // This makes 'settings' accesible from Prover
    using settings_ = settings;

    sumcheck::SumcheckOutput<Fr> sumcheck_output;
    pcs::gemini::ProverOutput<pcs::kzg::Params> gemini_output;
    pcs::shplonk::ProverOutput<pcs::kzg::Params> shplonk_output;

    using Transcript = transcript::StandardTranscript;
    using Gemini = pcs::gemini::MultilinearReductionScheme<pcs::kzg::Params>;
    using Shplonk = pcs::shplonk::SingleBatchOpeningScheme<pcs::kzg::Params>;
    using KZG = pcs::kzg::UnivariateOpeningScheme<pcs::kzg::Params>;

  private:
    plonk::proof proof;
};

extern template class Prover<plonk::standard_settings>;

using StandardProver = Prover<plonk::standard_settings>;

} // namespace honk
