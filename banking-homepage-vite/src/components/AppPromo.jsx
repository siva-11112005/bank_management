const AppPromo = () => {
  return (
    <section className="bg-primary py-14">
      <div className="section-container">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div className="animate-fade-up flex justify-center lg:justify-start">
            <div className="relative h-[380px] w-[220px] rounded-[2.2rem] border-4 border-slate-200 bg-slate-900 p-3 shadow-soft-lg">
              <div
                className="h-full w-full rounded-[1.7rem] bg-cover bg-center"
                style={{
                  backgroundImage:
                    "url('https://images.unsplash.com/photo-1616077168079-7e09a677fb2c?auto=format&fit=crop&w=600&q=80')",
                }}
              ></div>
              <div className="absolute left-1/2 top-2 h-1.5 w-20 -translate-x-1/2 rounded-full bg-slate-300"></div>
            </div>
          </div>

          <div className="animate-fade-up text-white" style={{ animationDelay: "120ms" }}>
            <p className="text-xs font-semibold uppercase tracking-wider text-blue-100">Mobile and web banking</p>
            <h2 className="mt-2 text-3xl font-bold sm:text-4xl">Experience New-Age Banking</h2>
            <p className="mt-4 max-w-xl text-sm leading-6 text-blue-100 sm:text-base">
              Manage UPI, bill payments, card controls, investments and instant support through our secure mobile app
              and netbanking platform.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <button className="rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-slate-900 transition hover:-translate-y-1">
                Download App
              </button>
              <button className="rounded-xl border border-white/70 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10">
                NetBanking
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default AppPromo;
