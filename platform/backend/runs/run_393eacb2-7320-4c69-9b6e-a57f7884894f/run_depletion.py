import openmc
import openmc.deplete

geometry = openmc.Geometry.from_xml('geometry.xml')
materials = openmc.Materials.from_xml('materials.xml')
settings = openmc.Settings.from_xml('settings.xml')
model = openmc.Model(geometry=geometry, materials=materials, settings=settings)

# 4 time steps of depletion (total 240 days)
time_steps = [30.0, 30.0, 60.0, 120.0]
power = 15.0e6

operator = openmc.deplete.CoupledOperator(model, "chain_simple.xml")
integrator = openmc.deplete.PredictorIntegrator(operator, time_steps, power, power_density=None)
integrator.integrate()
