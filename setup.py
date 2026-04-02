"""Setup configuration for pyMusicGPT."""

from setuptools import setup, find_packages

setup(
    name="pymusicgpt",
    version="0.1.0",
    description="Python implementation of MusicGPT – generate music from natural language prompts",
    packages=find_packages(exclude=["tests*"]),
    package_data={"musicgpt": ["../static/*"]},
    include_package_data=True,
    install_requires=[
        "transformers>=4.31.0",
        "torch>=2.0.0",
        "scipy>=1.10.0",
        "fastapi>=0.100.0",
        "uvicorn[standard]>=0.22.0",
        "pydantic>=2.0.0",
        "numpy>=1.24.0",
    ],
    entry_points={
        "console_scripts": [
            "musicgpt=musicgpt.cli:main",
        ],
    },
    python_requires=">=3.9",
)
